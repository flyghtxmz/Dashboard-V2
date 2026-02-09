import { jsonResponse, readJson, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";
const BID_STRATEGY_WITH_BID = "LOWEST_COST_WITH_BID_CAP";
const BID_STRATEGY_WITHOUT_BID = "LOWEST_COST_WITHOUT_CAP";
const BID_STRATEGY_DEFAULT = BID_STRATEGY_WITH_BID;

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) {
    return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const body = await readJson(request);
  const { adset_id, bid_amount_brl, bid_strategy } = body || {};
  if (!adset_id) {
    return jsonResponse(400, { error: "Parametro obrigatorio: adset_id" });
  }

  const bidStrategy = (bid_strategy || BID_STRATEGY_DEFAULT).toUpperCase();
  if (
    bidStrategy !== BID_STRATEGY_WITH_BID &&
    bidStrategy !== BID_STRATEGY_WITHOUT_BID
  ) {
    return jsonResponse(400, {
      error: "bid_strategy invalida. Use LOWEST_COST_WITH_BID_CAP ou LOWEST_COST_WITHOUT_CAP",
    });
  }

  let bidNumber = null;
  if (bidStrategy === BID_STRATEGY_WITH_BID) {
    bidNumber = Number(String(bid_amount_brl).replace(",", "."));
    if (!Number.isFinite(bidNumber) || bidNumber <= 0) {
      return jsonResponse(400, {
        error: "bid_amount_brl invalido para estrategia com bid",
      });
    }
  }

  try {
    const params = new URLSearchParams();
    params.set("bid_strategy", bidStrategy);
    if (bidStrategy === BID_STRATEGY_WITH_BID) {
      params.set("bid_amount", String(Math.round(bidNumber * 100)));
    }
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
        )}?fields=bid_amount,bid_strategy,optimization_goal,bid_constraints&access_token=${token}`
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
