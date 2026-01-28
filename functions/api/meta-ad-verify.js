import { jsonResponse, readJson, getQuery, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) {
    return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  }

  const method = request.method || "GET";
  if (method !== "GET" && method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const body = method === "POST" ? await readJson(request) : null;
  const ad_id = method === "GET" ? getQuery(request).get("ad_id") : body?.ad_id;
  if (!ad_id) {
    return jsonResponse(400, { error: "Parametros obrigatorios: ad_id" });
  }

  const q = new URLSearchParams();
  q.set(
    "fields",
    "id,name,status,effective_status,adset_id,campaign_id,creative{object_story_spec,object_story_id,url_tags}"
  );
  q.set("access_token", token);

  try {
    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(ad_id)}?${q.toString()}`
    );
    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, { error: "Erro Meta", details: data });
    }
    return jsonResponse(200, { code: "success", data });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao verificar anuncio",
      details: error.message,
    });
  }
}
