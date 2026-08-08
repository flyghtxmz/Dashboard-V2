import { jsonResponse, readJson, getMetaToken, safeJson } from "../_utils.js";

import { getSession } from "../_auth.js";
import { recordMetaBidHistory } from "../_meta-bid-history.js";

const API_BASE = "https://graph.facebook.com/v24.0";
const BID_STRATEGY_WITH_BID = "LOWEST_COST_WITH_BID_CAP";
const BID_STRATEGY_WITHOUT_BID = "LOWEST_COST_WITHOUT_CAP";
const BID_STRATEGY_COST_CAP = "COST_CAP";
const BID_STRATEGY_DEFAULT = BID_STRATEGY_WITH_BID;

function bidAmountCents(adset) {
  const strategy = String(adset?.bid_strategy || "").toUpperCase();
  const constraints = adset?.bid_constraints || {};
  if (strategy === BID_STRATEGY_COST_CAP) {
    return constraints.cost_per_result_goal ?? constraints.cost_cap ?? adset?.bid_amount ?? null;
  }
  if (strategy === BID_STRATEGY_WITH_BID) {
    return adset?.bid_amount ?? constraints.bid_cap ?? null;
  }
  return null;
}

async function fetchAdsetSnapshot(token, adsetId) {
  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(adsetId)}?fields=id,name,account_id,campaign{id,name},bid_amount,bid_strategy,optimization_goal,bid_constraints,updated_time&access_token=${token}`,
    { cache: "no-store" }
  );
  const data = await safeJson(response);
  return response.ok ? data : null;
}

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
    const session = await getSession(request, env);
    let previousAdset = null;
    try {
      previousAdset = await fetchAdsetSnapshot(token, adset_id);
    } catch (_) {
      previousAdset = null;
    }
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
    let adset = null;
    let confirmed = false;
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
      if (!response.ok) {
        errors.push({ attempt, details: data });
        continue;
      }

      for (let confirmationAttempt = 0; confirmationAttempt < 2; confirmationAttempt += 1) {
        try {
          adset = await fetchAdsetSnapshot(token, adset_id);
        } catch (_) {
          adset = null;
        }
        const actualStrategy = String(adset?.bid_strategy || "").toUpperCase();
        const actualAmount = bidAmountCents(adset);
        const strategyMatches = !updateStrategy || actualStrategy === bidStrategy;
        const amountMatches = !requiresAmount || (
          actualAmount != null && Number(actualAmount) === Number(amountCents)
        );
        if (strategyMatches && amountMatches) {
          confirmed = true;
          break;
        }
        if (confirmationAttempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
      }
      if (confirmed) break;
      errors.push({
        attempt,
        details: {
          message: "A Meta respondeu com sucesso, mas nao confirmou a alteracao.",
          adset,
        },
      });
    }

    if (!response?.ok || !confirmed) {
      const payload = {
        error: response?.ok ? "Alteracao nao confirmada pela Meta" : "Erro Meta",
        details: data,
        attempts: errors,
      };
      if (soft_fail) {
        return jsonResponse(200, {
          code: "meta_rejected",
          ok: false,
          adset,
          requested_strategy: updateStrategy ? bidStrategy : null,
          applied: false,
          warning:
            data?.error?.message ||
            "A Meta nao confirmou a estrategia/valor do conjunto.",
          ...payload,
        });
      }
      return jsonResponse(response?.ok ? 409 : response?.status || 400, payload);
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

    const previousAmountCents = bidAmountCents(previousAdset);
    const confirmedAmountCents = bidAmountCents(adset);
    const previousStrategy = String(previousAdset?.bid_strategy || "").toUpperCase() || null;
    const confirmedStrategy = String(adset?.bid_strategy || "").toUpperCase() || null;
    const stateChanged =
      previousStrategy !== confirmedStrategy ||
      Number(previousAmountCents ?? -1) !== Number(confirmedAmountCents ?? -1);
    let history = { saved: false, reason: stateChanged ? "NOT_RECORDED" : "NO_CONFIRMED_CHANGE" };
    if (stateChanged && adset) {
      try {
        history = await recordMetaBidHistory(env, {
          actorId: session?.id || null,
          actorUsername: session?.username || session?.email || null,
          actorRole: session?.role || null,
          accountId: adset.account_id || previousAdset?.account_id || null,
          campaignId: adset.campaign?.id || previousAdset?.campaign?.id || null,
          campaignName: adset.campaign?.name || previousAdset?.campaign?.name || null,
          adsetId: adset_id,
          adsetName: adset.name || previousAdset?.name || null,
          previousStrategy,
          requestedStrategy: updateStrategy ? bidStrategy : previousStrategy,
          confirmedStrategy,
          previousAmountBrl: previousAmountCents != null ? Number(previousAmountCents) / 100 : null,
          requestedAmountBrl: bidNumber,
          confirmedAmountBrl: confirmedAmountCents != null ? Number(confirmedAmountCents) / 100 : null,
          amountOnly: !!amount_only,
          metaUpdatedTimeBefore: previousAdset?.updated_time || null,
          metaUpdatedTimeAfter: adset?.updated_time || null,
          status: "confirmed",
        });
      } catch (historyError) {
        history = { saved: false, reason: "HISTORY_WRITE_FAILED", error: historyError.message };
      }
    }

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
      history,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao atualizar lance",
      details: error.message,
    });
  }
}
