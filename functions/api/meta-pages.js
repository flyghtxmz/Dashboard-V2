import { jsonResponse, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) {
    return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  }

  if (request.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const response = await fetch(
      `${API_BASE}/me/accounts?fields=id,name,category,access_token&limit=200&access_token=${token}`
    );
    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, { error: "Erro Meta", details: data });
    }
    return jsonResponse(200, { code: "success", data: data.data || [] });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao listar paginas",
      details: error.message,
    });
  }
}
