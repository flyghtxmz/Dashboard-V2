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
