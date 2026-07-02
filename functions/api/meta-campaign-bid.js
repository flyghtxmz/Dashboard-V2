import { jsonResponse, readJson, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";
const BID_STRATEGY_WITH_BID = "LOWEST_COST_WITH_BID_CAP";
const BID_STRATEGY_WITHOUT_BID = "LOWEST_COST_WITHOUT_CAP";
const BID_STRATEGY_COST_CAP = "COST_CAP";
const BID_STRATEGY_DEFAULT = BID_STRATEGY_WITH_BID;

// Em campanhas com Orcamento de Campanha (CBO/Advantage), a estrategia de lance e definida na
// CAMPANHA, nao no conjunto. O valor do cap/cost cap continua indo no conjunto (meta-adset-bid).
export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) {
    return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const body = await readJson(request);
  const { campaign_id, bid_strategy } = body || {};
  if (!campaign_id) {
    return jsonResponse(400, { error: "Parametro obrigatorio: campaign_id" });
  }

  const bidStrategy = (bid_strategy || BID_STRATEGY_DEFAULT).toUpperCase();
  if (
    bidStrategy !== BID_STRATEGY_WITH_BID &&
    bidStrategy !== BID_STRATEGY_WITHOUT_BID &&
    bidStrategy !== BID_STRATEGY_COST_CAP
  ) {
    return jsonResponse(400, {
      error:
        "bid_strategy invalida. Use LOWEST_COST_WITH_BID_CAP, LOWEST_COST_WITHOUT_CAP ou COST_CAP",
    });
  }

  try {
    const params = new URLSearchParams();
    params.set("bid_strategy", bidStrategy);
    params.set("access_token", token);

    const response = await fetch(`${API_BASE}/${encodeURIComponent(campaign_id)}`, {
      method: "POST",
      body: params,
    });
    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, { error: "Erro Meta", details: data });
    }

    let campaign = null;
    try {
      const checkRes = await fetch(
        `${API_BASE}/${encodeURIComponent(
          campaign_id
        )}?fields=bid_strategy,objective&access_token=${token}`
      );
      campaign = await safeJson(checkRes);
    } catch (e) {
      campaign = null;
    }

    const actualStrategy = String(campaign?.bid_strategy || "").toUpperCase();
    const applied = actualStrategy ? actualStrategy === bidStrategy : null;
    const warning =
      applied === false
        ? `A Meta manteve a estrategia "${actualStrategy}" em vez de "${bidStrategy}" na campanha.`
        : undefined;

    return jsonResponse(200, {
      code: "success",
      data,
      campaign,
      requested_strategy: bidStrategy,
      applied,
      warning,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao atualizar estrategia da campanha",
      details: error.message,
    });
  }
}
