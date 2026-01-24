import { jsonResponse, getQuery, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

async function fetchAll(url) {
  const results = [];
  let next = url;
  while (next) {
    const res = await fetch(next);
    const json = await safeJson(res);
    if (!res.ok) {
      const err = new Error("Erro Meta");
      err.details = json;
      throw err;
    }
    results.push(...(json.data || []));
    next = json?.paging?.next || null;
  }
  return results;
}

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) {
    return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  }

  if (request.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const params = getQuery(request);
  const adset_id = params.get("adset_id");
  if (!adset_id) {
    return jsonResponse(400, { error: "Parametros obrigatorios: adset_id" });
  }

  try {
    const adsUrl = `${API_BASE}/${encodeURIComponent(
      adset_id
    )}/ads?fields=id,name,status,effective_status&limit=200&access_token=${token}`;
    const ads = await fetchAll(adsUrl);
    return jsonResponse(200, { code: "success", data: ads });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao consultar ads",
      details: error.details || error.message,
    });
  }
}
