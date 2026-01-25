import {
  jsonResponse,
  getMetaToken,
  getMetaAppId,
  getMetaAppSecret,
  safeJson,
} from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

export async function onRequest({ request, env }) {
  if (request.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const token = getMetaToken(env);
  if (!token) {
    return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  }

  const appId = getMetaAppId(env);
  const appSecret = getMetaAppSecret(env);
  if (!appId || !appSecret) {
    return jsonResponse(500, {
      error: "META_APP_ID ou META_APP_SECRET nao configurado",
    });
  }

  const appToken = `${appId}|${appSecret}`;
  const url = `${API_BASE}/debug_token?input_token=${encodeURIComponent(
    token
  )}&access_token=${encodeURIComponent(appToken)}`;

  try {
    const response = await fetch(url);
    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, { error: "Erro Meta", details: data });
    }
    return jsonResponse(200, { code: "success", data: data?.data || data });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao verificar token",
      details: error.message,
    });
  }
}
