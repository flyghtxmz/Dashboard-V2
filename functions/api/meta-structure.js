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
async function fetchPaged(url, cap = 50000) {
  const results = [];
  let next = url;
  while (next) {
    const json = await fetchWithRetry(next);
    results.push(...(json.data || []));
    next = json?.paging?.next || null;
    if (results.length >= cap && next) {
      const error = new Error(`Meta pagination cap reached (${cap})`);
      error.status = 422;
      throw error;
    }
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

async function fetchSinglePage(url) {
  const json = await fetchWithRetry(url);
  return json.data || [];
}

function extractCreativeImageHash(creative) {
  const spec = creative?.object_story_spec || {};
  return String(
    creative?.image_hash ||
      spec?.link_data?.image_hash ||
      spec?.photo_data?.image_hash ||
      creative?.asset_feed_spec?.images?.[0]?.hash ||
      ""
  );
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
  const cacheKey = `meta_structure:v5:${account_id}:${start_date || ""}:${end_date || ""}`;

  // ── KV cache read ──────────────────────────────────────
  if (kv && !force) {
    try {
      const cached = await kv.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const age = Date.now() - (parsed._cachedAt || 0);
        // Caches anteriores nao continham a arvore canonica. Ignora esse formato para
        // evitar que a nova tela pareca vazia logo apos o deploy.
        if (age < CACHE_TTL_MS && Array.isArray(parsed.structure)) {
          delete parsed._cachedAt;
          return jsonResponse(200, {
            code: "success",
            cached: true,
            data: parsed.rows,
            campaigns: parsed.campaigns || [],
            adsets: parsed.adsets || [],
            structure: parsed.structure || [],
          });
        }
      }
    } catch { /* fall through */ }
  }

  const act = account_id.startsWith("act_") ? account_id : `act_${account_id}`;
  const t = encodeURIComponent(token);

  try {
    // ── 3 parallel paginated fetches — NO nested loops ────
    const campFields = "id,name,objective,status,effective_status,daily_budget,lifetime_budget,budget_remaining,bid_strategy";
    const adsetFields = "id,name,status,effective_status,daily_budget,lifetime_budget,campaign_id,optimization_goal,bid_strategy,bid_amount,bid_constraints,targeting,promoted_object,start_time,end_time";
    const adFields = "id,name,status,effective_status,adset_id,campaign_id,updated_time,creative{id,url_tags,image_hash,thumbnail_url,actor_id,instagram_actor_id,asset_feed_spec,object_story_id,effective_object_story_id,link_url,object_url,object_story_spec{page_id,instagram_actor_id,link_data{link,image_hash,picture},photo_data{image_hash},video_data{call_to_action}}}";
    const insightFields = "ad_id,spend,ctr,cpc,cpm,frequency,impressions,video_thruplay_watched_actions";
    const imageFields = "hash,url,url_128";

    const [campaigns, adsets, ads, insightsRaw] = await Promise.all([
      fetchPaged(`${API_BASE}/${act}/campaigns?fields=${campFields}&limit=200&access_token=${t}`),
      fetchPaged(`${API_BASE}/${act}/adsets?fields=${adsetFields}&limit=200&access_token=${t}`),
      fetchPaged(`${API_BASE}/${act}/ads?fields=${adFields}&limit=500&access_token=${t}`),
      fetchPaged(`${API_BASE}/${act}/insights?fields=${insightFields}&level=ad&${start_date && end_date ? `time_range=${encodeURIComponent(JSON.stringify({ since: start_date, until: end_date }))}` : "date_preset=last_30d"}&limit=500&access_token=${t}`),
    ]);

    const requestedImageHashes = [...new Set(ads.map((ad) => extractCreativeImageHash(ad?.creative)).filter(Boolean))];
    const accountImages = [];
    for (let index = 0; index < requestedImageHashes.length; index += 50) {
      const hashChunk = requestedImageHashes.slice(index, index + 50);
      const images = await fetchSinglePage(
        `${API_BASE}/${act}/adimages?fields=${imageFields}&hashes=${encodeURIComponent(JSON.stringify(hashChunk))}&limit=50&access_token=${t}`
      );
      accountImages.push(...images);
    }

    // ── Build lookup maps ─────────────────────────────────
    const campMap = new Map(campaigns.map((c) => [c.id, c]));
    const adsetMap = new Map(adsets.map((a) => [a.id, a]));
    const imageByHash = new Map(
      (accountImages || [])
        .filter((image) => image?.hash)
        .map((image) => [String(image.hash), image])
    );
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
      const imageHash = extractCreativeImageHash(ad?.creative);
      const accountImage = imageByHash.get(imageHash);
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
        page_id: spec?.page_id || ad?.creative?.actor_id || "",
        instagram_actor_id: spec?.instagram_actor_id || ad?.creative?.instagram_actor_id || "",
        url_tags: ad?.creative?.url_tags || "",
        url,
        object_story_id:
          ad?.creative?.effective_object_story_id ||
          ad?.creative?.object_story_id || "",
        destination_url: destination,
        image_hash: imageHash,
        thumbnail_url:
          accountImage?.url_128 ||
          accountImage?.url ||
          spec?.link_data?.picture ||
          ad?.creative?.thumbnail_url ||
          "",
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

    // Estrutura canônica: preserva campanhas e conjuntos mesmo quando ainda não têm anúncios.
    const adsByAdset = new Map();
    ads.forEach((ad) => {
      if (!adsByAdset.has(ad.adset_id)) adsByAdset.set(ad.adset_id, []);
      const spec = ad?.creative?.object_story_spec || {};
      const imageHash = extractCreativeImageHash(ad?.creative);
      const accountImage = imageByHash.get(imageHash);
      adsByAdset.get(ad.adset_id).push({
        id: ad.id,
        name: ad.name,
        status: ad.status,
        effective_status: ad.effective_status,
        campaign_id: ad.campaign_id,
        adset_id: ad.adset_id,
        page_id: spec?.page_id || ad?.creative?.actor_id || "",
        instagram_actor_id: spec?.instagram_actor_id || ad?.creative?.instagram_actor_id || "",
        url_tags: ad?.creative?.url_tags || "",
        destination_url: ad?.creative?.link_url || ad?.creative?.object_url || extractUrl(spec) || "",
        object_story_id: ad?.creative?.effective_object_story_id || ad?.creative?.object_story_id || "",
        image_hash: imageHash,
        thumbnail_url:
          accountImage?.url_128 ||
          accountImage?.url ||
          spec?.link_data?.picture ||
          ad?.creative?.thumbnail_url ||
          "",
      });
    });
    const adsetsByCampaign = new Map();
    adsets.forEach((adset) => {
      if (!adsetsByCampaign.has(adset.campaign_id)) adsetsByCampaign.set(adset.campaign_id, []);
      adsetsByCampaign.get(adset.campaign_id).push({
        ...adset,
        ads: adsByAdset.get(adset.id) || [],
      });
    });
    const structure = campaigns.map((campaign) => ({
      ...campaign,
      adsets: adsetsByCampaign.get(campaign.id) || [],
    }));

    // ── KV cache write ────────────────────────────────────
    if (kv) {
      try {
        await kv.put(
          cacheKey,
          JSON.stringify({ rows, campaigns, adsets, structure, _cachedAt: Date.now() }),
          { expirationTtl: Math.ceil((CACHE_TTL_MS * 2) / 1000) }
        );
      } catch { /* non-fatal */ }
    }

    return jsonResponse(200, { code: "success", cached: false, data: rows, campaigns, adsets, structure });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao consultar Meta",
      details: error.details || error.message,
    });
  }
}
