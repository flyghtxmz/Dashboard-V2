import { jsonResponse, getQuery, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

async function fetchPaged(url) {
  const results = [];
  let next = url;
  while (next) {
    const res = await fetch(next);
    const json = await safeJson(res);
    if (!res.ok) throw Object.assign(new Error("Meta API error"), { details: json });
    results.push(...(json.data || []));
    next = json?.paging?.next || null;
    if (results.length >= 500) break; // safety cap
  }
  return results;
}

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  if (request.method !== "GET") return jsonResponse(405, { error: "Method not allowed" });

  const params = getQuery(request);
  const account_id = params.get("account_id");
  if (!account_id) return jsonResponse(400, { error: "Parametro obrigatorio: account_id" });

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

    return jsonResponse(200, { code: "success", data: { images, videos } });
  } catch (err) {
    return jsonResponse(500, { error: "Erro ao buscar mídias", details: err.details || err.message });
  }
}
