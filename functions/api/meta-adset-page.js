import { jsonResponse, readJson, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

export function replacePromotedObjectPage(promotedObject, pageId) {
  const current = promotedObject && typeof promotedObject === "object" ? promotedObject : {};
  return { ...current, page_id: String(pageId) };
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  const token = getMetaToken(env);
  if (!token) return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  const body = await readJson(request);
  const adsetId = String(body?.adset_id || "").trim();
  const pageId = String(body?.page_id || "").trim();
  if (!/^\d+$/.test(adsetId) || !/^\d+$/.test(pageId)) {
    return jsonResponse(400, { error: "adset_id e page_id validos sao obrigatorios" });
  }

  try {
    const currentResponse = await fetch(
      `${API_BASE}/${encodeURIComponent(adsetId)}?fields=promoted_object&access_token=${encodeURIComponent(token)}`,
      { cache: "no-store" }
    );
    const currentData = await safeJson(currentResponse);
    if (!currentResponse.ok) {
      return jsonResponse(currentResponse.status, { error: "Erro Meta", details: currentData });
    }
    const promotedObject = replacePromotedObjectPage(currentData?.promoted_object, pageId);
    if (String(currentData?.promoted_object?.page_id || "") === pageId) {
      return jsonResponse(200, { code: "success", adset_id: adsetId, page_id: pageId, promoted_object: promotedObject, changed: false });
    }
    const params = new URLSearchParams({
      promoted_object: JSON.stringify(promotedObject),
      access_token: token,
    });
    const updateResponse = await fetch(`${API_BASE}/${encodeURIComponent(adsetId)}`, {
      method: "POST",
      body: params,
    });
    const updateData = await safeJson(updateResponse);
    if (!updateResponse.ok) {
      return jsonResponse(updateResponse.status, { error: "Erro Meta", details: updateData });
    }
    return jsonResponse(200, {
      code: "success",
      adset_id: adsetId,
      page_id: pageId,
      promoted_object: promotedObject,
      changed: true,
      data: updateData,
    });
  } catch (error) {
    return jsonResponse(500, { error: "Erro ao atualizar Pagina do conjunto", details: error?.message || String(error) });
  }
}
