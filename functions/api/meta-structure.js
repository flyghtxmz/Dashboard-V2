import { jsonResponse, getQuery, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Retry with exponential backoff on rate-limit errors
async function fetchWithRetry(url, maxRetries = 4) {
  let delay = 1000;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url);
    const json = await safeJson(res);
    const code = json?.error?.code;
    const isRateLimit = res.status === 429 || code === 17 || code === 32 || code === 4;
    if (isRateLimit && attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 16000);
      continue;
    }
    if (!res.ok) {
      const err = new Error("Meta API error");
      err.details = json;
      throw err;
    }
    return json;
  }
}

// Paginated fetch — small pause between pages to stay within rate limits
async function fetchPaged(url, cap = 2000) {
  const results = [];
  let next = url;
  while (next) {
    const json = await fetchWithRetry(next);
    results.push(...(json.data || []));
    next = json?.paging?.next || null;
    if (results.length >= cap) break;
    if (next) await new Promise((r) => setTimeout(r, 250));
  }
  return results;
}

function extractUrl(spec) {
  if (!spec || typeof spec !== "object") return "";
  if (spec.link_data?.link) return spec.link_data.link;
  const v = spec.video_data?.call_to_action?.value?.link;
  return v || "";
}

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  if (request.method !== "GET") return jsonResponse(405, { error: "Method not allowed" });

  const params = getQuery(request);
  const account_id = params.get("account_id");
  if (!account_id) return jsonResponse(400, { error: "Parametros obrigatorios: account_id" });

  const start_date = params.get("start_date");
  const end_date = params.get("end_date");
  const force = params.get("force") === "1" || params.get("force") === "true";
  const kv = env.CPA_RULES_KV || env.DASHBOARD_KV;
  const cacheKey = `meta_structure:${account_id}:${start_date || ""}:${end_date || ""}`;

  // ── KV cache read ──────────────────────────────────────
  if (kv && !force) {
    try {
      const cached = await kv.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const age = Date.now() - (parsed._cachedAt || 0);
        if (age < CACHE_TTL_MS) {
          delete parsed._cachedAt;
          return jsonResponse(200, { code: "success", cached: true, data: parsed.rows });
        }
      }
    } catch { /* fall through */ }
  }

  const act = account_id.startsWith("act_") ? account_id : `act_${account_id}`;
  const t = encodeURIComponent(token);

  try {
    // ── 3 parallel paginated fetches — NO nested loops ────
    const campFields = "id,name,status,effective_status,daily_budget,lifetime_budget,budget_remaining";
    const adsetFields = "id,name,status,effective_status,daily_budget,lifetime_budget,campaign_id";
    const adFields = "id,name,status,effective_status,adset_id,campaign_id,updated_time,creative{url_tags,object_story_id,effective_object_story_id,link_url,object_url,object_story_spec{link_data{link},video_data{call_to_action}}}";
    const insightFields = "ad_id,spend,ctr,cpc,cpm,frequency,impressions,video_thruplay_watched_actions";

    const [campaigns, adsets, ads, insightsRaw] = await Promise.all([
      fetchPaged(`${API_BASE}/${act}/campaigns?fields=${campFields}&limit=200&access_token=${t}`),
      fetchPaged(`${API_BASE}/${act}/adsets?fields=${adsetFields}&limit=200&access_token=${t}`),
      fetchPaged(`${API_BASE}/${act}/ads?fields=${adFields}&limit=500&access_token=${t}`),
      fetchPaged(`${API_BASE}/${act}/insights?fields=${insightFields}&level=ad&${start_date && end_date ? `time_range=${encodeURIComponent(JSON.stringify({ since: start_date, until: end_date }))}` : "date_preset=last_30d"}&limit=500&access_token=${t}`).catch(() => []),
    ]);

    // ── Build lookup maps ─────────────────────────────────
    const campMap = new Map(campaigns.map((c) => [c.id, c]));
    const adsetMap = new Map(adsets.map((a) => [a.id, a]));
    const insightMap = new Map();
    for (const r of insightsRaw) {
      const prev = insightMap.get(r.ad_id);
      if (!prev) {
        insightMap.set(r.ad_id, r);
      } else {
        // sum spend; other fields take latest value
        insightMap.set(r.ad_id, { ...prev, spend: String((parseFloat(prev.spend || 0) + parseFloat(r.spend || 0)).toFixed(2)) });
      }
    }

    // ── Flatten to rows (same shape as meta-ad-edit-list) ─
    const rows = ads.map((ad) => {
      const camp = campMap.get(ad.campaign_id) || {};
      const adset = adsetMap.get(ad.adset_id) || {};
      const ins = insightMap.get(ad.id) || {};
      const spec = ad?.creative?.object_story_spec || {};
      const url = extractUrl(spec);
      const destination =
        ad?.creative?.link_url ||
        ad?.creative?.object_url ||
        url || "";
      const thruplay = (ins.video_thruplay_watched_actions || [])[0]?.value || null;
      const impressions = ins.impressions ? parseFloat(ins.impressions) : null;
      const video_thruplay_rate = (thruplay && impressions && impressions > 0)
        ? String(((parseFloat(thruplay) / impressions) * 100).toFixed(2))
        : null;
      return {
        id: ad.id,
        ad_id: ad.id,
        name: ad.name,
        status: ad.status,
        effective_status: ad.effective_status,
        adset_id: ad.adset_id,
        adset_name: adset.name || ad.adset_id || "",
        adset_status: adset.effective_status || adset.status || "",
        campaign_id: ad.campaign_id,
        campaign_name: camp.name || ad.campaign_id || "",
        campaign_status: camp.effective_status || camp.status || "",
        campaign_daily_budget: camp.daily_budget || "",
        campaign_lifetime_budget: camp.lifetime_budget || "",
        url_tags: ad?.creative?.url_tags || "",
        url,
        object_story_id:
          ad?.creative?.effective_object_story_id ||
          ad?.creative?.object_story_id || "",
        destination_url: destination,
        updated_time: ad.updated_time || "",
        // insights (last 30d)
        spend: ins.spend || null,
        ctr: ins.ctr || null,
        cpc: ins.cpc || null,
        cpm: ins.cpm || null,
        frequency: ins.frequency || null,
        video_thruplay_rate,
      };
    });

    // ── KV cache write ────────────────────────────────────
    if (kv) {
      try {
        await kv.put(
          cacheKey,
          JSON.stringify({ rows, _cachedAt: Date.now() }),
          { expirationTtl: Math.ceil((CACHE_TTL_MS * 2) / 1000) }
        );
      } catch { /* non-fatal */ }
    }

    return jsonResponse(200, { code: "success", cached: false, data: rows });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao consultar Meta",
      details: error.details || error.message,
    });
  }
}
