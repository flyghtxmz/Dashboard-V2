const MESSAGE_SORT_TYPES = new Map([
  ["campaign_name", "text"],
  ["meta_impressions", "number"],
  ["ctr_meta", "number"],
  ["conversations", "number"],
  ["meta_cost_per_result", "number"],
  ["cost_per_conversation", "number"],
  ["revenue_per_conversation", "number"],
  ["profit_per_conversation", "number"],
  ["joinads_impressions", "number"],
  ["joinads_impressions_per_conversation", "number"],
  ["visits_per_conversation", "number"],
  ["joinads_clicks", "number"],
  ["spend_brl", "number"],
  ["revenue_usd", "number"],
  ["revenue_brl", "number"],
  ["roas", "number"],
  ["profit_brl", "number"],
  ["margin_pct", "number"],
  ["ecpm", "number"],
]);

export function sortMessageCampaignRows(rows, sorting = {}) {
  const validKey = MESSAGE_SORT_TYPES.has(sorting?.key);
  const key = validKey ? sorting.key : "revenue_brl";
  const direction = validKey && sorting?.direction === "asc" ? "asc" : "desc";
  const multiplier = direction === "asc" ? 1 : -1;
  const type = MESSAGE_SORT_TYPES.get(key);

  return (Array.isArray(rows) ? rows : []).slice().sort((left, right) => {
    const leftRaw = left?.[key];
    const rightRaw = right?.[key];
    const leftMissing = type === "text"
      ? !String(leftRaw || "").trim()
      : leftRaw === null || leftRaw === undefined || !Number.isFinite(Number(leftRaw));
    const rightMissing = type === "text"
      ? !String(rightRaw || "").trim()
      : rightRaw === null || rightRaw === undefined || !Number.isFinite(Number(rightRaw));
    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
    if (!leftMissing) {
      const comparison = type === "text"
        ? String(leftRaw).localeCompare(String(rightRaw), "pt-BR", { numeric: true })
        : Number(leftRaw) - Number(rightRaw);
      if (comparison) return comparison * multiplier;
    }
    return String(left?.campaign_name || "").localeCompare(
      String(right?.campaign_name || ""),
      "pt-BR",
      { numeric: true }
    );
  });
}

export function matchesMessageCampaignFilter(row, filter = "") {
  const selected = String(filter || "").trim().toLowerCase();
  if (!selected) return true;
  const objective = String(row?.objective || "").trim().toUpperCase();
  const optimization = String(
    row?.adset_optimization_goal || row?.optimization_goal || ""
  ).trim().toUpperCase();
  if (selected === "sales") return objective.includes("SALES");
  if (selected === "conversations") return optimization.includes("CONVERSATION");
  return true;
}

export function resolveMessageBudgetTarget(adset) {
  if (!adset?.id) return { id: "", scope: "adset" };
  const hasAdsetBudget =
    Number(adset.dailyBudgetBrl || 0) > 0 || Number(adset.lifetimeBudgetBrl || 0) > 0;
  const hasCampaignBudget =
    Number(adset.campaignDailyBudgetBrl || 0) > 0 ||
    Number(adset.campaignLifetimeBudgetBrl || 0) > 0;
  if (hasCampaignBudget && !hasAdsetBudget && adset.campaignId) {
    return { id: adset.campaignId, scope: "campaign" };
  }
  return { id: adset.id, scope: "adset" };
}

export function resolveMessageBidConfirmationStrategy({
  cbo = false,
  campaignStrategy = "",
  adsetStrategy = "",
} = {}) {
  const campaignValue = String(campaignStrategy || "").trim().toUpperCase();
  const adsetValue = String(adsetStrategy || "").trim().toUpperCase();
  return cbo ? campaignValue || adsetValue : adsetValue;
}

export function finalizeMessageCampaignAttribution(row = {}) {
  const hasAttribution = row.has_joinads_attribution === true;
  if (!hasAttribution) {
    return {
      ...row,
      joinads_impressions: null,
      joinads_clicks: null,
      revenue_usd: null,
      revenue_brl: null,
      roas: null,
      profit_brl: null,
      ecpm: null,
      joinads_impressions_per_conversation: null,
      visits_per_conversation: null,
      revenue_per_conversation: null,
      profit_per_conversation: null,
      margin_pct: null,
      attribution_status: "unavailable",
    };
  }

  const spend = Number(row.spend_brl || 0);
  const conversations = Number(row.conversations || 0);
  const impressions = Number(row.joinads_impressions || 0);
  const clicks = Number(row.joinads_clicks || 0);
  const revenueUsd = Number(row.revenue_usd || 0);
  const revenueBrl = Number(row.revenue_brl || 0);
  const profitBrl = revenueBrl - spend;
  return {
    ...row,
    roas: spend > 0 ? revenueBrl / spend : null,
    profit_brl: profitBrl,
    ecpm: impressions > 0 ? revenueUsd / impressions * 1000 : null,
    joinads_impressions_per_conversation: conversations > 0 ? impressions / conversations : null,
    visits_per_conversation: conversations > 0 ? clicks / conversations : null,
    revenue_per_conversation: conversations > 0 ? revenueBrl / conversations : null,
    profit_per_conversation: conversations > 0 ? profitBrl / conversations : null,
    margin_pct: revenueBrl > 0 ? profitBrl / revenueBrl * 100 : null,
    attribution_status: "attributed",
  };
}

export function hasCompleteMessageCampaignAttribution(rows = []) {
  const paidRows = (Array.isArray(rows) ? rows : []).filter((row) =>
    Number(row?.spend_brl || 0) > 0 || Number(row?.meta_impressions || 0) > 0
  );
  return paidRows.length === 0 || paidRows.every((row) => row?.has_joinads_attribution === true);
}

export function classifyMessageBidConfirmation({
  requestedStrategy = "",
  actualStrategy = "",
  requestedAmount = null,
  actualAmount = null,
  requiresAmount = false,
} = {}) {
  const requested = String(requestedStrategy || "").trim().toUpperCase();
  const actual = String(actualStrategy || "").trim().toUpperCase();
  const strategyKnown = Boolean(actual);
  const strategyMatches = strategyKnown && actual === requested;
  const actualNumber = actualAmount == null ? null : Number(actualAmount);
  const requestedNumber = requestedAmount == null ? null : Number(requestedAmount);
  const amountKnown = !requiresAmount || Number.isFinite(actualNumber);
  const amountMatches = !requiresAmount || (
    amountKnown && Number.isFinite(requestedNumber) && Math.abs(actualNumber - requestedNumber) < 0.005
  );

  if (strategyKnown && !strategyMatches) return "rejected_strategy";
  if (amountKnown && !amountMatches) return "rejected_amount";
  if (strategyMatches && amountMatches) return "confirmed";
  if (requiresAmount && !strategyKnown && amountMatches) return "confirmed_amount";
  return "inconclusive";
}
