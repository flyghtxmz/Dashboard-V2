import { jsonResponse, readJson, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";
const BID_STRATEGY_WITH_BID = "LOWEST_COST_WITH_BID_CAP";
const BID_STRATEGY_WITHOUT_BID = "LOWEST_COST_WITHOUT_CAP";
const BID_STRATEGY_COST_CAP = "COST_CAP";
const BID_STRATEGY_DEFAULT = BID_STRATEGY_WITH_BID;

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) {
    return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  }

  if (request.method === "GET") {
    const adsetId = new URL(request.url).searchParams.get("adset_id");
    if (!adsetId) {
      return jsonResponse(400, { error: "Parametro obrigatorio: adset_id" });
    }
    try {
      const checkRes = await fetch(
        `${API_BASE}/${encodeURIComponent(adsetId)}?fields=bid_amount,bid_strategy,optimization_goal,bid_constraints,updated_time&access_token=${token}`,
        { cache: "no-store" }
      );
      const adset = await safeJson(checkRes);
      if (!checkRes.ok) {
        return jsonResponse(checkRes.status, { error: "Erro Meta", details: adset });
      }
      return jsonResponse(200, { code: "success", adset, confirmed_at: new Date().toISOString() });
    } catch (error) {
      return jsonResponse(500, { error: "Erro ao confirmar lance", details: error.message });
    }
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const body = await readJson(request);
  const { adset_id, bid_amount_brl, bid_strategy, amount_only, soft_fail } = body || {};
  if (!adset_id) {
    return jsonResponse(400, { error: "Parametro obrigatorio: adset_id" });
  }

  const bidStrategy = (bid_strategy || BID_STRATEGY_DEFAULT).toUpperCase();
  const updateStrategy = !amount_only;
  if (
    updateStrategy &&
    bidStrategy !== BID_STRATEGY_WITH_BID &&
    bidStrategy !== BID_STRATEGY_WITHOUT_BID &&
    bidStrategy !== BID_STRATEGY_COST_CAP
  ) {
    return jsonResponse(400, {
      error:
        "bid_strategy invalida. Use LOWEST_COST_WITH_BID_CAP, LOWEST_COST_WITHOUT_CAP ou COST_CAP",
    });
  }

  const requiresAmount =
    amount_only ||
    bidStrategy === BID_STRATEGY_WITH_BID ||
    bidStrategy === BID_STRATEGY_COST_CAP;

  let bidNumber = null;
  if (requiresAmount) {
    bidNumber = Number(String(bid_amount_brl).replace(",", "."));
    if (!Number.isFinite(bidNumber) || bidNumber <= 0) {
      return jsonResponse(400, {
        error: "bid_amount_brl invalido para estrategia com valor de custo",
      });
    }
  }

  try {
    const amountCents = requiresAmount ? Math.round(bidNumber * 100) : null;
    const attempts = [];
    const base = {};
    if (updateStrategy) base.bid_strategy = bidStrategy;

    if (requiresAmount && bidStrategy === BID_STRATEGY_COST_CAP && updateStrategy) {
      attempts.push({ ...base, bid_amount: String(amountCents) });
      attempts.push({
        ...base,
        bid_constraints: JSON.stringify({ cost_per_result_goal: amountCents }),
      });
      attempts.push({
        ...base,
        bid_constraints: JSON.stringify({ cost_cap: amountCents }),
      });
    } else if (requiresAmount && amount_only) {
      attempts.push({ bid_amount: String(amountCents) });
      attempts.push({
        bid_constraints: JSON.stringify({ cost_per_result_goal: amountCents }),
      });
      attempts.push({
        bid_constraints: JSON.stringify({ cost_cap: amountCents }),
      });
    } else {
      attempts.push({
        ...base,
        ...(requiresAmount ? { bid_amount: String(amountCents) } : {}),
      });
    }

    let data = null;
    let response = null;
    const errors = [];
    for (const attempt of attempts) {
      const params = new URLSearchParams();
      Object.entries(attempt).forEach(([key, value]) => params.set(key, value));
      params.set("access_token", token);

      response = await fetch(`${API_BASE}/${encodeURIComponent(adset_id)}`, {
        method: "POST",
        body: params,
      });
      data = await safeJson(response);
      if (response.ok) break;
      errors.push({ attempt, details: data });
    }

    if (!response?.ok) {
      const payload = {
        error: "Erro Meta",
        details: data,
        attempts: errors,
      };
      if (soft_fail) {
        return jsonResponse(200, {
          code: "meta_rejected",
          ok: false,
          adset: null,
          requested_strategy: updateStrategy ? bidStrategy : null,
          applied: false,
          warning:
            data?.error?.message ||
            "A Meta recusou alterar a estrategia/valor do conjunto.",
          ...payload,
        });
      }
      return jsonResponse(response?.status || 400, payload);
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

    // A Meta retorna 200 mesmo quando ignora a troca de estrategia (comum quando a estrategia e
    // controlada na campanha via orcamento de campanha/CBO). Comparamos o que foi pedido com o que
    // ficou de fato, para nao falhar em silencio.
    const actualStrategy = String(adset?.bid_strategy || "").toUpperCase();
    const constraints = adset?.bid_constraints || {};
    const actualAmountCents = bidStrategy === BID_STRATEGY_COST_CAP
      ? constraints.cost_per_result_goal ?? constraints.cost_cap ?? adset?.bid_amount
      : adset?.bid_amount ?? constraints.bid_cap;
    const strategyApplied = updateStrategy && actualStrategy ? actualStrategy === bidStrategy : null;
    const amountApplied = requiresAmount && actualAmountCents != null
      ? Number(actualAmountCents) === amountCents
      : requiresAmount ? false : null;
    const applied = strategyApplied === false || amountApplied === false
      ? false
      : strategyApplied ?? amountApplied;
    const amountWarning = amountApplied === false
      ? `A Meta manteve o limite em R$ ${(Number(actualAmountCents || 0) / 100).toFixed(2)} em vez de R$ ${bidNumber.toFixed(2)}.`
      : undefined;
    const warning =
      applied === false
        ? `A Meta manteve a estrategia "${actualStrategy}" em vez de "${bidStrategy}". Normalmente a estrategia de lance e controlada na campanha (orcamento de campanha/CBO) ou a transicao nao e permitida neste nivel — nesse caso, altere a estrategia na campanha.`
        : undefined;

    return jsonResponse(200, {
      code: "success",
      ok: true,
      data,
      adset,
      requested_strategy: updateStrategy ? bidStrategy : null,
      requested_amount_brl: bidNumber,
      actual_amount_brl: actualAmountCents != null ? Number(actualAmountCents) / 100 : null,
      amount_applied: amountApplied,
      applied,
      warning: amountWarning || warning,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao atualizar lance",
      details: error.message,
    });
  }
}
