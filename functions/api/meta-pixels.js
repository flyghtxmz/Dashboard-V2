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

  const url = new URL(request.url);
  const accountId = url.searchParams.get("account_id");
  if (!accountId) {
    return jsonResponse(400, { error: "Parametro obrigatorio: account_id" });
  }

  try {
    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(accountId)}/adspixels?fields=id,name,last_fired_time,is_unavailable&limit=100&access_token=${token}`
    );
    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, { error: "Erro Meta", details: data });
    }
    return jsonResponse(200, { code: "success", data: data.data || [] });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao listar pixels",
      details: error.message,
    });
  }
}
