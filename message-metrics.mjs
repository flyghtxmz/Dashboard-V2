const MESSAGE_SORT_KEYS = new Set([
  "revenue_usd",
  "revenue_brl",
  "roas",
  "profit_brl",
  "margin_pct",
  "ecpm",
]);

export function sortMessageCampaignRows(rows, sorting = {}) {
  const validKey = MESSAGE_SORT_KEYS.has(sorting?.key);
  const key = validKey ? sorting.key : "revenue_brl";
  const direction = validKey && sorting?.direction === "asc" ? "asc" : "desc";
  const multiplier = direction === "asc" ? 1 : -1;

  return (Array.isArray(rows) ? rows : []).slice().sort((left, right) => {
    const leftRaw = left?.[key];
    const rightRaw = right?.[key];
    const leftMissing = leftRaw === null || leftRaw === undefined || !Number.isFinite(Number(leftRaw));
    const rightMissing = rightRaw === null || rightRaw === undefined || !Number.isFinite(Number(rightRaw));
    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
    if (!leftMissing) {
      const difference = (Number(leftRaw) - Number(rightRaw)) * multiplier;
      if (difference) return difference;
    }
    return String(left?.campaign_name || "").localeCompare(
      String(right?.campaign_name || ""),
      "pt-BR",
      { numeric: true }
    );
  });
}
