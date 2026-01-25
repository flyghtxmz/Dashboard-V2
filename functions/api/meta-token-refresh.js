import {
  jsonResponse,
  getMetaToken,
  getMetaAppId,
  getMetaAppSecret,
  safeJson,
} from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
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

  const url = `${API_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(
    appId
  )}&client_secret=${encodeURIComponent(
    appSecret
  )}&fb_exchange_token=${encodeURIComponent(token)}`;

  try {
    const response = await fetch(url);
    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, { error: "Erro Meta", details: data });
    }
    const expiresIn = Number(data?.expires_in || 0);
    const expiresAt = expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : null;
    return jsonResponse(200, {
      code: "success",
      access_token: data?.access_token,
      token_type: data?.token_type,
      expires_in: expiresIn,
      expires_at: expiresAt,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao renovar token",
      details: error.message,
    });
  }
}
