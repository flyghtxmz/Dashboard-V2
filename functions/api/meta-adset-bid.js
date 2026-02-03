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
  const { adset_id, bid_amount_brl } = body || {};
  if (!adset_id || bid_amount_brl === undefined || bid_amount_brl === null) {
    return jsonResponse(400, {
      error: "Parametros obrigatorios: adset_id, bid_amount_brl",
    });
  }

  const bidNumber = Number(String(bid_amount_brl).replace(",", "."));
  if (!Number.isFinite(bidNumber) || bidNumber <= 0) {
    return jsonResponse(400, { error: "bid_amount_brl invalido" });
  }

  try {
    const params = new URLSearchParams();
    params.set("bid_amount", String(Math.round(bidNumber * 100)));
    params.set("access_token", token);

    const response = await fetch(`${API_BASE}/${encodeURIComponent(adset_id)}`, {
      method: "POST",
      body: params,
    });
    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, { error: "Erro Meta", details: data });
    }

    let adset = null;
    try {
      const checkRes = await fetch(
        `${API_BASE}/${encodeURIComponent(
          adset_id
        )}?fields=bid_amount,bid_strategy,optimization_goal&access_token=${token}`
      );
      adset = await safeJson(checkRes);
    } catch (e) {
      adset = null;
    }

    return jsonResponse(200, { code: "success", data, adset });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao atualizar lance",
      details: error.message,
    });
  }
}
