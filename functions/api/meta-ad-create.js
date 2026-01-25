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
  const { ad_id, adset_id, name, status } = body || {};
  if (!ad_id || !adset_id) {
    return jsonResponse(400, { error: "Parametros obrigatorios: ad_id, adset_id" });
  }

  try {
    const creativeRes = await fetch(
      `${API_BASE}/${encodeURIComponent(
        ad_id
      )}?fields=creative{id},name&access_token=${token}`
    );
    const creativeJson = await safeJson(creativeRes);
    if (!creativeRes.ok) {
      return jsonResponse(creativeRes.status, {
        error: "Erro Meta",
        details: creativeJson,
      });
    }

    const creativeId = creativeJson?.creative?.id;
    if (!creativeId) {
      return jsonResponse(400, { error: "Creative_id nao encontrado" });
    }

    const params = new URLSearchParams();
    params.set("name", name || creativeJson?.name || "Copia");
    params.set("status", status || "PAUSED");
    params.set("creative", JSON.stringify({ creative_id: creativeId }));
    params.set("access_token", token);

    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(adset_id)}/ads`,
      { method: "POST", body: params }
    );
    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, { error: "Erro Meta", details: data });
    }
    return jsonResponse(200, { code: "success", data, new_ad_id: data?.id || null });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao criar anuncio",
      details: error.message,
    });
  }
}
