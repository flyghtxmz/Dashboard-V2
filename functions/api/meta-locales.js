import { jsonResponse, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

export async function onRequest({ request, env }) {
  if (request.method !== "GET") return jsonResponse(405, { error: "Method not allowed" });
  const token = getMetaToken(env);
  if (!token) return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });

  try {
    const params = new URLSearchParams({
      type: "adlocale",
      limit: "1000",
      access_token: token,
    });
    const response = await fetch(`${API_BASE}/search?${params.toString()}`);
    const data = await safeJson(response);
    if (!response.ok) return jsonResponse(response.status, { error: "Erro Meta", details: data });

    const locales = (Array.isArray(data?.data) ? data.data : [])
      .map((item) => ({ id: Number(item.key), label: String(item.name || "").trim() }))
      .filter((item) => Number.isFinite(item.id) && item.id > 0 && item.label);
    return jsonResponse(200, { code: "success", data: locales });
  } catch (error) {
    return jsonResponse(500, { error: "Erro ao carregar idiomas da Meta", details: error.message });
  }
}
