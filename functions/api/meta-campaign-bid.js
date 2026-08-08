import { jsonResponse, readJson, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";
const BID_STRATEGY_WITH_BID = "LOWEST_COST_WITH_BID_CAP";
const BID_STRATEGY_WITHOUT_BID = "LOWEST_COST_WITHOUT_CAP";
const BID_STRATEGY_COST_CAP = "COST_CAP";
const BID_STRATEGY_DEFAULT = BID_STRATEGY_WITH_BID;

function readBidAmountCents(adset, strategy) {
  const constraints = adset?.bid_constraints || {};
  if (strategy === BID_STRATEGY_COST_CAP) {
    return constraints.cost_per_result_goal ?? constraints.cost_cap ?? adset?.bid_amount ?? null;
  }
  return adset?.bid_amount ?? constraints.bid_cap ?? null;
}

function normalizeAdsetBidAmounts(body, required) {
  if (!required) return {};
  const raw = body?.adset_bid_amounts && typeof body.adset_bid_amounts === "object"
    ? body.adset_bid_amounts
    : body?.adset_id
    ? { [body.adset_id]: body.bid_amount_brl }
    : {};
  const normalized = {};
  for (const [adsetId, value] of Object.entries(raw)) {
    const amount = Number(String(value ?? "").replace(",", "."));
    if (!adsetId || !Number.isFinite(amount) || amount <= 0) {
      throw new Error("adset_bid_amounts invalido");
    }
    normalized[String(adsetId)] = Math.round(amount * 100);
  }
  return normalized;
}

// Em campanhas com Orcamento de Campanha (CBO/Advantage), a Meta aceita a estrategia e o mapa
// adset_bid_amounts juntos na CAMPANHA. O envio atomico evita rejeicao durante a troca de estrategia.
export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) {
    return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const body = await readJson(request);
  const { campaign_id, bid_strategy, soft_fail } = body || {};
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

  const requiresBidAmounts =
    bidStrategy === BID_STRATEGY_WITH_BID || bidStrategy === BID_STRATEGY_COST_CAP;
  let adsetBidAmounts = {};
  try {
    adsetBidAmounts = normalizeAdsetBidAmounts(body, requiresBidAmounts);
  } catch (error) {
    return jsonResponse(400, { error: error.message });
  }

  try {
    const params = new URLSearchParams();
    params.set("bid_strategy", bidStrategy);
    if (Object.keys(adsetBidAmounts).length) {
      params.set("adset_bid_amounts", JSON.stringify(adsetBidAmounts));
    }
    params.set("access_token", token);

    const response = await fetch(`${API_BASE}/${encodeURIComponent(campaign_id)}`, {
      method: "POST",
      body: params,
    });
    const data = await safeJson(response);
    if (!response.ok) {
      if (soft_fail) {
        return jsonResponse(200, {
          code: "meta_rejected",
          ok: false,
          campaign: null,
          requested_strategy: bidStrategy,
          applied: false,
          warning: data?.error?.message || "A Meta recusou alterar a estrategia da campanha.",
          details: data,
        });
      }
      return jsonResponse(response.status, { error: "Erro Meta", details: data });
    }

    let campaign = null;
    let adsets = [];
    let actualStrategy = "";
    let strategyApplied = null;
    let amountApplied = null;
    for (let confirmationAttempt = 0; confirmationAttempt < 3; confirmationAttempt += 1) {
      try {
        const checkRes = await fetch(
          `${API_BASE}/${encodeURIComponent(
            campaign_id
          )}?fields=bid_strategy,objective&access_token=${token}`,
          { cache: "no-store" }
        );
        campaign = checkRes.ok ? await safeJson(checkRes) : null;
      } catch (_) {
        campaign = null;
      }
      adsets = [];
      for (const adsetId of Object.keys(adsetBidAmounts)) {
        try {
          const adsetRes = await fetch(
            `${API_BASE}/${encodeURIComponent(adsetId)}?fields=id,bid_amount,bid_strategy,optimization_goal,bid_constraints,updated_time&access_token=${token}`,
            { cache: "no-store" }
          );
          const adset = await safeJson(adsetRes);
          if (adsetRes.ok) adsets.push(adset);
        } catch (_) {
          // A ausencia desta leitura sera tratada como confirmacao inconclusiva.
        }
      }
      actualStrategy = String(campaign?.bid_strategy || "").toUpperCase();
      strategyApplied = actualStrategy ? actualStrategy === bidStrategy : null;
      amountApplied = Object.keys(adsetBidAmounts).length
        ? Object.entries(adsetBidAmounts).every(([adsetId, expected]) => {
            const adset = adsets.find((item) => String(item?.id) === String(adsetId));
            const actual = readBidAmountCents(adset, bidStrategy);
            return actual != null && Number(actual) === Number(expected);
          })
        : null;
      if (strategyApplied === true && amountApplied !== false) break;
      if (confirmationAttempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const applied = strategyApplied === true && amountApplied !== false
      ? true
      : strategyApplied === false || amountApplied === false
      ? false
      : null;
    const warning =
      applied === false
        ? strategyApplied === false
          ? `A Meta manteve a estrategia "${actualStrategy}" em vez de "${bidStrategy}" na campanha.`
          : "A Meta aceitou a estrategia, mas nao confirmou a meta de custo nos conjuntos."
        : undefined;

    return jsonResponse(200, {
      code: "success",
      data,
      campaign,
      adsets,
      requested_strategy: bidStrategy,
      requested_adset_bid_amounts: adsetBidAmounts,
      strategy_applied: strategyApplied,
      amount_applied: amountApplied,
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
