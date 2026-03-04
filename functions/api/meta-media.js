import { jsonResponse, getQuery, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

// Retry a fetch up to `maxRetries` times on rate-limit / server errors,
// with exponential backoff (1s → 2s → 4s …).
async function fetchWithRetry(url, options = {}, maxRetries = 4) {
  let delay = 1000;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    const json = await safeJson(res);

    // HTTP 429 or Meta error codes 17 (rate limit) / 32 (throttle)
    const metaCode = json?.error?.code;
    const isRateLimit = res.status === 429 || metaCode === 17 || metaCode === 32;

    if (isRateLimit && attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
      continue;
    }
    if (!res.ok) throw Object.assign(new Error("Meta API error"), { details: json });
    return json;
  }
}

async function fetchPaged(url) {
  const results = [];
  let next = url;
  while (next) {
    const json = await fetchWithRetry(next);
    results.push(...(json.data || []));
    next = json?.paging?.next || null;
    if (results.length >= 500) break; // safety cap
    // Small pause between pages to stay well within rate limits
    if (next) await new Promise((r) => setTimeout(r, 300));
  }
  return results;
}

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });

  if (request.method === "DELETE") {
    const params = getQuery(request);
    const key = params.get("key");
    const type = params.get("type");
    if (!key || !type) return jsonResponse(400, { error: "Parametros obrigatorios: key, type" });

    if (type === "video") {
      const t = encodeURIComponent(token);
      const res = await fetch(`${API_BASE}/${key}?access_token=${t}`, { method: "DELETE" });
      const json = await safeJson(res);
      if (!res.ok) return jsonResponse(500, { error: "Erro ao deletar vídeo na Meta", details: json });
      return jsonResponse(200, { code: "success", deleted: true });
    }

    // Images cannot be deleted via Meta API — mark as hidden in KV
    const account_id = params.get("account_id");
    if (!account_id) return jsonResponse(400, { error: "account_id obrigatorio para ocultar imagem" });
    const kv = env.CPA_RULES_KV || env.DASHBOARD_KV;
    if (!kv) return jsonResponse(500, { error: "KV nao configurado" });
    const kvKey = `media_labels:${account_id}`;
    let existing = {};
    try { existing = JSON.parse(await kv.get(kvKey) || "{}"); } catch { }
    existing[key] = { ...(existing[key] || {}), deleted: true };
    await kv.put(kvKey, JSON.stringify(existing));
    return jsonResponse(200, { code: "success", deleted: true, note: "Imagem ocultada localmente (Meta API nao suporta exclusao de imagens)" });
  }

  if (request.method !== "GET") return jsonResponse(405, { error: "Method not allowed" });

  const params = getQuery(request);
  const account_id = params.get("account_id");
  if (!account_id) return jsonResponse(400, { error: "Parametro obrigatorio: account_id" });

  const force = params.get("force") === "1" || params.get("force") === "true";
  const kv = env.CPA_RULES_KV || env.DASHBOARD_KV;
  const cacheKey = `media_list:${account_id}`;

  // ── KV cache read ────────────────────────────────────────
  if (kv && !force) {
    try {
      const cached = await kv.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const age = Date.now() - (parsed._cachedAt || 0);
        if (age < CACHE_TTL_MS) {
          delete parsed._cachedAt;
          return jsonResponse(200, { code: "success", cached: true, data: parsed });
        }
      }
    } catch {
      // cache miss / corrupt — fall through to live fetch
    }
  }

  const act = account_id.startsWith("act_") ? account_id : `act_${account_id}`;
  const t = encodeURIComponent(token);

  try {
    const [rawImages, rawVideos] = await Promise.all([
      fetchPaged(`${API_BASE}/${act}/adimages?fields=hash,name,url,width,height,created_time&limit=200&access_token=${t}`),
      fetchPaged(`${API_BASE}/${act}/advideos?fields=id,title,picture,length,created_time&limit=200&access_token=${t}`),
    ]);

    const images = rawImages.map((img) => ({
      key: img.hash,
      type: "image",
      name: img.name || img.hash,
      url: img.url,
      width: img.width,
      height: img.height,
      created_time: img.created_time,
    }));

    const videos = rawVideos.map((vid) => ({
      key: vid.id,
      type: "video",
      name: vid.title || vid.id,
      url: vid.picture,
      duration: vid.length,
      created_time: vid.created_time,
    }));

    const payload = { images, videos };

    // ── KV cache write ───────────────────────────────────────
    if (kv) {
      try {
        await kv.put(cacheKey, JSON.stringify({ ...payload, _cachedAt: Date.now() }), {
          expirationTtl: Math.ceil((CACHE_TTL_MS * 2) / 1000), // KV TTL = 40 min safety margin
        });
      } catch {
        // non-fatal — continue even if cache write fails
      }
    }

    return jsonResponse(200, { code: "success", cached: false, data: payload });
  } catch (err) {
    return jsonResponse(500, { error: "Erro ao buscar mídias", details: err.details || err.message });
  }
}
