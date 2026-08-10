export const SITE_URL_TAGS =
  "utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_term={{adset.id}}_{{ad.id}}&placement={{placement}}";

export function normalizeCountryLabel(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const COUNTRY_ALIASES = new Map([
  ["rep dominicana", "republica dominicana"],
  ["dominican republic", "republica dominicana"],
  ["usa", "estados unidos"],
  ["united states", "estados unidos"],
]);

export function resolveNicheCountryCodes(niche, countryList = []) {
  const byLabel = new Map();
  for (const country of Array.isArray(countryList) ? countryList : []) {
    const code = String(country?.code || "").trim().toUpperCase();
    if (!code) continue;
    for (const label of [code, country?.name]) {
      const normalized = normalizeCountryLabel(label);
      if (!normalized) continue;
      byLabel.set(normalized, code);
      byLabel.set(COUNTRY_ALIASES.get(normalized) || normalized, code);
    }
  }

  const values = Array.isArray(niche?.paises)
    ? niche.paises
    : niche?.pais
    ? [niche.pais]
    : [];
  const result = [];
  for (const value of values) {
    const raw = typeof value === "object" ? value.code || value.name : value;
    const normalized = normalizeCountryLabel(raw);
    const canonical = COUNTRY_ALIASES.get(normalized) || normalized;
    const code = byLabel.get(canonical) || byLabel.get(normalized);
    if (code && !result.includes(code)) result.push(code);
  }
  return result;
}

export function createBuilderId(prefix = "item") {
  const random = globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${random}`;
}

export function nextBuilderNumber(values = []) {
  const highest = (Array.isArray(values) ? values : []).reduce((max, value) => {
    const parsed = Number.parseInt(String(value || ""), 10);
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 0);
  return String(highest + 1).padStart(2, "0");
}

export function upsertBuilderAd(savedAds = [], nextAd = {}, editingId = null) {
  const current = Array.isArray(savedAds) ? savedAds : [];
  if (!editingId) return [...current, nextAd];
  let replaced = false;
  const updated = current.map((ad) => {
    const matches = ad?._clientId === editingId ||
      (!ad?._clientId && ad?._anNum === nextAd?._anNum);
    if (!matches) return ad;
    replaced = true;
    return nextAd;
  });
  return replaced ? updated : [...updated, nextAd];
}

export function builderAdDraftFingerprint(ad = {}) {
  const automaticName = !ad?._nameManual;
  const comparable = Object.fromEntries(
    Object.entries(ad || {}).filter(([key]) => key !== "_clientId" && key !== "name")
  );
  comparable.name = automaticName ? "" : String(ad?.name || "");
  return JSON.stringify(comparable);
}

export function buildAutomaticAdName(niche, countries, cjNumber, adNumber) {
  const slug = String(niche?.slug || niche || "anuncio").trim() || "anuncio";
  const geo = (Array.isArray(countries) && countries.length ? countries : ["BR"])
    .map((code) => String(code || "").trim().toLowerCase())
    .filter(Boolean)
    .join("-");
  const cj = String(cjNumber || "01").padStart(2, "0");
  const ad = String(adNumber || "01").padStart(2, "0");
  return `${slug}-${geo}-cj${cj}-an${ad}`;
}

function withoutPrivateFields(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([key]) => !key.startsWith("_"))
  );
}

export function materializeCampaignAdsets({
  adsets = [],
  ads = [],
  niche = null,
  status = "PAUSED",
  preserveMetadata = false,
} = {}) {
  const safeAdsets = Array.isArray(adsets) ? adsets : [];
  const safeAds = Array.isArray(ads) ? ads : [];
  const allAdsetIds = safeAdsets.map((item) => item?._clientId).filter(Boolean);

  return safeAdsets.map((adset) => {
    const clientId = adset?._clientId;
    const assignedAds = safeAds
      .filter((ad) => {
        const targets = Array.isArray(ad?._targetAdsetIds) && ad._targetAdsetIds.length
          ? ad._targetAdsetIds
          : allAdsetIds;
        return clientId && targets.includes(clientId);
      })
      .map((ad) => ({
        ...(preserveMetadata ? ad : withoutPrivateFields(ad)),
        name: ad?._nameManual
          ? String(ad?.name || "").trim()
          : buildAutomaticAdName(niche, adset?.countries, adset?._cjNum, ad?._anNum),
        status,
      }));

    return {
      ...(preserveMetadata ? adset : withoutPrivateFields(adset)),
      status,
      ads: assignedAds,
    };
  });
}
