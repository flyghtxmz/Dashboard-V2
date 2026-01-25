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
  const {
    ad_id,
    adset_id,
    status_option,
    rename_strategy,
    rename_options,
  } = body || {};
  if (!ad_id || !adset_id) {
    return jsonResponse(400, { error: "Parametros obrigatorios: ad_id, adset_id" });
  }

  try {
    const params = new URLSearchParams();
    params.set("adset_id", adset_id);
    if (status_option) params.set("status_option", status_option);
    if (rename_strategy) params.set("rename_strategy", rename_strategy);
    if (rename_options) {
      params.set("rename_options", JSON.stringify(rename_options));
    }
    params.set("access_token", token);

    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(ad_id)}/copies`,
      {
        method: "POST",
        body: params,
      }
    );
    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, { error: "Erro Meta", details: data });
    }
    const newId = data?.copied_ad_id || data?.id || data?.copied_id || null;
    return jsonResponse(200, { code: "success", data, new_ad_id: newId });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao copiar anuncio",
      details: error.message,
    });
  }
}
