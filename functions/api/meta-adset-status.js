import { jsonResponse, readJson, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) {
    return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const body = await readJson(request);
  const { adset_id, status } = body || {};
  if (!adset_id || !status) {
    return jsonResponse(400, {
      error: "Parametros obrigatorios: adset_id, status",
    });
  }

  try {
    const params = new URLSearchParams();
    params.set("status", status);
    params.set("access_token", token);
    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(adset_id)}`,
      { method: "POST", body: params }
    );
    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, { error: "Erro Meta", details: data });
    }
    return jsonResponse(200, { code: "success", data });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao atualizar conjunto",
      details: error.message,
    });
  }
}
