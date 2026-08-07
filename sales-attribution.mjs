function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function rowDomainMatches(row, domainKey) {
  if (!domainKey) return true;
  const rowDomain = normalize(row?.domain || row?.name || "");
  return !rowDomain || rowDomain === domainKey;
}

function customValue(row) {
  return String(row?.custom_value ?? row?.custon_value ?? "").trim();
}

/**
 * Monta a atribuicao por anuncio usando fontes equivalentes em ordem de
 * prioridade. Cada fonte e agregada separadamente e a primeira que devolver
 * o ID exato do anuncio vence; os mesmos ganhos nunca sao somados entre
 * endpoints da JoinAds.
 */
export function buildJoinadsAdAttributionIndex({
  adIds = [],
  sources = [],
  domain = "",
} = {}) {
  const validAdIds = new Set(
    (Array.isArray(adIds) ? adIds : [])
      .map(normalize)
      .filter(Boolean)
  );
  const domainKey = normalize(domain);
  const preferred = new Map();

  (Array.isArray(sources) ? sources : []).forEach((source) => {
    const sourceTotals = new Map();
    (Array.isArray(source?.rows) ? source.rows : []).forEach((row) => {
      if (!rowDomainMatches(row, domainKey)) return;
      const adId = normalize(customValue(row));
      if (!adId || !validAdIds.has(adId)) return;
      const total = sourceTotals.get(adId) || {
        impressions: 0,
        clicks: 0,
        revenue: 0,
        revenue_client: 0,
        ecpm: null,
        ecpm_client: null,
        data_level: source?.dataLevel || "utm_content_ad_id",
        source_endpoint: source?.sourceEndpoint || source?.dataLevel || "utm_content",
        source_value: customValue(row),
      };
      total.impressions += toFiniteNumber(row?.impressions);
      total.clicks += toFiniteNumber(row?.clicks);
      total.revenue += toFiniteNumber(row?.revenue ?? row?.earnings);
      total.revenue_client += toFiniteNumber(row?.revenue_client ?? row?.earnings_client);
      if (row?.ecpm != null) total.ecpm = toFiniteNumber(row.ecpm);
      if (row?.ecpm_client != null) total.ecpm_client = toFiniteNumber(row.ecpm_client);
      sourceTotals.set(adId, total);
    });
    sourceTotals.forEach((total, adId) => {
      if (!preferred.has(adId)) preferred.set(adId, total);
    });
  });

  return preferred;
}

export function isMessageCampaignValue(value) {
  return normalize(value).startsWith("src_");
}

/**
 * Informa se existe alguma correspondencia segura com a JoinAds. A presenca
 * global de linhas em outra dimensao (por exemplo utm_content=organic) nunca
 * pode apagar uma correspondencia exata por utm_term=adset_id.
 */
export function hasJoinadsAttributionMatch({
  resolvedAd = false,
  content = false,
  custom = false,
  campaign = false,
  term = false,
} = {}) {
  return !!(resolvedAd || content || custom || campaign || term);
}

function isNonSalesCampaignValue(value) {
  const key = normalize(value);
  return isMessageCampaignValue(key) || key === "organic" || key.startsWith("organic_");
}

function createJoinadsTotal() {
  return {
    impressions: 0,
    clicks: 0,
    revenue: 0,
    revenueClient: 0,
    rows: 0,
  };
}

function addRawJoinadsRow(total, row) {
  total.impressions += toFiniteNumber(row?.impressions);
  total.clicks += toFiniteNumber(row?.clicks);
  total.revenue += toFiniteNumber(row?.revenue ?? row?.earnings);
  total.revenueClient += toFiniteNumber(row?.revenue_client ?? row?.earnings_client);
  total.rows += 1;
}

function indexCampaignRows(rows, domainKey) {
  const index = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!rowDomainMatches(row, domainKey)) return;
    const rawValue = customValue(row);
    if (isNonSalesCampaignValue(rawValue)) return;
    const key = normalize(rawValue);
    if (!key) return;
    const total = index.get(key) || createJoinadsTotal();
    addRawJoinadsRow(total, row);
    index.set(key, total);
  });
  return index;
}

/**
 * Resume somente o trafego de mensagens identificado pela origem persistida
 * src_. Totais globais por utm_medium ficam fora para nao misturar vendas,
 * organico ou trafego sem classificacao no resumo oficial de mensagens.
 */
export function buildMessageJoinadsSummary({
  campaignRows = [],
  domain = "",
  brlRate = 0,
  spendBrl = 0,
} = {}) {
  const domainKey = normalize(domain);
  const summary = {
    rows: 0,
    sources: new Set(),
    impressions: 0,
    clicks: 0,
    revenue: 0,
    revenueClient: 0,
  };

  (Array.isArray(campaignRows) ? campaignRows : []).forEach((row) => {
    if (!rowDomainMatches(row, domainKey)) return;
    const value = customValue(row);
    if (!isMessageCampaignValue(value)) return;
    summary.rows += 1;
    summary.sources.add(normalize(value));
    summary.impressions += toFiniteNumber(row?.impressions);
    summary.clicks += toFiniteNumber(row?.clicks);
    summary.revenue += toFiniteNumber(row?.revenue ?? row?.earnings);
    summary.revenueClient += toFiniteNumber(row?.revenue_client ?? row?.earnings_client);
  });

  const numericRate = toFiniteNumber(brlRate);
  const numericSpend = toFiniteNumber(spendBrl);
  const revenueClientBrl = numericRate > 0 ? summary.revenueClient * numericRate : null;
  return {
    rows: summary.rows,
    sources: summary.sources.size,
    impressions: summary.impressions,
    clicks: summary.clicks,
    revenue: summary.revenue,
    revenueClient: summary.revenueClient,
    revenueClientBrl,
    spendBrl: numericSpend,
    ctr: summary.impressions > 0 ? summary.clicks / summary.impressions * 100 : 0,
    ecpmClient: summary.impressions > 0
      ? summary.revenueClient / summary.impressions * 1000
      : null,
    roas: revenueClientBrl != null && numericSpend > 0
      ? revenueClientBrl / numericSpend
      : null,
    profitBrl: revenueClientBrl != null ? revenueClientBrl - numericSpend : null,
  };
}

function hasMetricSignal(total) {
  return !!total && (
    total.impressions !== 0 ||
    total.clicks !== 0 ||
    total.revenue !== 0 ||
    total.revenueClient !== 0
  );
}

function campaignMatch(index, campaignId, campaignName) {
  const idKey = normalize(campaignId);
  const nameKey = normalize(campaignName);
  if (idKey && index.has(idKey)) return { total: index.get(idKey), match: "id" };
  if (nameKey && index.has(nameKey)) return { total: index.get(nameKey), match: "name" };
  return null;
}

function attributedAdTotal(rows) {
  const total = createJoinadsTotal();
  (rows || []).forEach((row) => {
    if (!row?.joinads_matched || row?.data_level === "utm_term_summary") return;
    total.impressions += toFiniteNumber(row.impressions_joinads);
    total.clicks += toFiniteNumber(row.clicks_joinads);
    total.revenue += toFiniteNumber(row.revenue_joinads_value);
    total.revenueClient += toFiniteNumber(row.revenue_client_value);
    total.rows += 1;
  });
  return total;
}

/**
 * Consolida a receita de vendas diretas uma unica vez por campanha.
 *
 * A linha de utm_campaign e a fonte preferida porque representa o total da
 * campanha mesmo quando ela possui varios anuncios. A granularidade por
 * anuncio fica como fallback, sem multiplicar o total da campanha.
 */
export function buildDirectSalesCampaignRows({
  metaRows = [],
  campaignRows = [],
  fallbackCampaignRows = [],
  domain = "",
  brlRate = 0,
} = {}) {
  const domainKey = normalize(domain);
  const primaryIndex = indexCampaignRows(campaignRows, domainKey);
  const fallbackIndex = indexCampaignRows(fallbackCampaignRows, domainKey);
  const campaigns = new Map();

  (Array.isArray(metaRows) ? metaRows : []).forEach((row, index) => {
    const campaignId = String(row?.campaign_id || "").trim();
    const campaignName = String(row?.campaign_name || "Campanha sem nome").trim();
    const key = normalize(campaignId || campaignName) || `campaign:${index}`;
    const current = campaigns.get(key) || {
      campaignId,
      campaignName,
      domain: domain || row?.domain || "",
      rows: [],
    };
    current.rows.push(row);
    if (!current.campaignId && campaignId) current.campaignId = campaignId;
    if ((!current.campaignName || current.campaignName === "Campanha sem nome") && campaignName) {
      current.campaignName = campaignName;
    }
    campaigns.set(key, current);
  });

  return Array.from(campaigns.values()).map((campaign) => {
    const primary = campaignMatch(primaryIndex, campaign.campaignId, campaign.campaignName);
    const fallback = campaignMatch(fallbackIndex, campaign.campaignId, campaign.campaignName);
    const adTotal = attributedAdTotal(campaign.rows);

    let selected = null;
    let attributionSource = "unmatched";
    if (hasMetricSignal(primary?.total)) {
      selected = primary.total;
      attributionSource = `utm_campaign_${primary.match}`;
    } else if (hasMetricSignal(fallback?.total)) {
      selected = fallback.total;
      attributionSource = `key_value_campaign_${fallback.match}`;
    } else if (hasMetricSignal(adTotal)) {
      selected = adTotal;
      attributionSource = "ad_level";
    } else if (primary?.total) {
      selected = primary.total;
      attributionSource = `utm_campaign_${primary.match}`;
    } else if (fallback?.total) {
      selected = fallback.total;
      attributionSource = `key_value_campaign_${fallback.match}`;
    } else {
      selected = adTotal;
    }

    const impressions = selected.impressions;
    const clicks = selected.clicks;
    const revenue = selected.revenue;
    const revenueClient = selected.revenueClient;
    const numericRate = toFiniteNumber(brlRate);

    return {
      campaign_id: campaign.campaignId,
      campaign_name: campaign.campaignName,
      domain: campaign.domain,
      custom_value: campaign.campaignName,
      impressions,
      clicks,
      revenue,
      revenue_client: revenueClient,
      revenue_client_brl: numericRate > 0 ? revenueClient * numericRate : null,
      ctr: impressions > 0 ? clicks / impressions * 100 : 0,
      ecpm: impressions > 0 ? revenue / impressions * 1000 : 0,
      ecpm_client: impressions > 0 ? revenueClient / impressions * 1000 : 0,
      active_view: null,
      joinads_matched: attributionSource !== "unmatched",
      attribution_source: attributionSource,
    };
  });
}
