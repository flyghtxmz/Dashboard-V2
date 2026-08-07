function readCjMatches(value) {
  return [...String(value || "").matchAll(/cj(\d+)/gi)].map((match) => ({
    number: Number(match[1]),
    width: match[1].length,
  }));
}

export function nextCampaignCjToken(campaign, sourceAdset) {
  const names = [
    sourceAdset?.name,
    ...(campaign?.adsets || []).flatMap((adset) => [
      adset?.name,
      ...(adset?.ads || []).map((ad) => ad?.name),
    ]),
  ];
  const matches = names.flatMap(readCjMatches).filter((item) => Number.isFinite(item.number));
  const highest = matches.reduce((max, item) => Math.max(max, item.number), 0);
  const width = Math.max(2, ...matches.map((item) => item.width));
  return `cj${String(highest + 1).padStart(width, "0")}`;
}

export function replaceCjToken(value, nextToken) {
  const name = String(value || "").trim();
  if (!name) return nextToken;
  if (/cj\d+/i.test(name)) return name.replace(/cj\d+/gi, nextToken);
  if (/-?an\d+/i.test(name)) return name.replace(/(-?an\d+)/i, `-${nextToken}$1`);
  return `${name}-${nextToken}`;
}

export function shiftCjName(value, offset = 0) {
  if (!offset) return String(value || "");
  return String(value || "").replace(/cj(\d+)/gi, (_token, digits) => {
    const next = Number(digits) + Number(offset || 0);
    return `cj${String(next).padStart(Math.max(2, digits.length), "0")}`;
  });
}

export function nextAnName(sourceName, existingNames = []) {
  const names = [sourceName, ...(existingNames || [])].map((value) => String(value || ""));
  const matches = names.flatMap((name) =>
    [...name.matchAll(/an(\d+)/gi)].map((match) => ({ number: Number(match[1]), width: match[1].length }))
  );
  const highest = matches.reduce((max, item) => Math.max(max, item.number || 0), 0);
  const width = Math.max(2, ...matches.map((item) => item.width));
  const token = `an${String(highest + 1).padStart(width, "0")}`;
  const normalizedSource = String(sourceName || "Anuncio").trim();
  return /an\d+/i.test(normalizedSource)
    ? normalizedSource.replace(/an\d+/gi, token)
    : `${normalizedSource}-${token}`;
}

export function buildModelDraftNames(campaign, adset) {
  const cjToken = nextCampaignCjToken(campaign, adset);
  return {
    cjToken,
    adsetName: replaceCjToken(adset?.name || "Conjunto", cjToken),
    adNames: new Map(
      (adset?.ads || []).map((ad) => [ad.id, replaceCjToken(ad.name || "Anuncio", cjToken)])
    ),
  };
}

export function nextCampaignCopyName(sourceName, campaigns = []) {
  const source = String(sourceName || "Campanha").trim();
  const match = source.match(/^(.*?\bcmp[-_ ]?)(\d+)(.*)$/i);
  if (!match) return `${source} - Copia`;
  const [, prefix, digits, suffix] = match;
  const comparablePrefix = prefix.toLowerCase();
  const comparableSuffix = suffix.toLowerCase();
  const candidates = [source, ...(campaigns || []).map((campaign) => campaign?.name)]
    .map((name) => String(name || "").match(/^(.*?\bcmp[-_ ]?)(\d+)(.*)$/i))
    .filter((item) => item && item[1].toLowerCase() === comparablePrefix && item[3].toLowerCase() === comparableSuffix)
    .map((item) => Number(item[2]))
    .filter(Number.isFinite);
  const next = Math.max(Number(digits), ...candidates) + 1;
  return `${prefix}${String(next).padStart(digits.length, "0")}${suffix}`;
}

export function buildCampaignCopyStructure(campaign) {
  return (campaign?.adsets || []).map((adset, adsetIndex) => {
    const cjToken = `cj${String(adsetIndex + 1).padStart(2, "0")}`;
    return {
      source_adset_id: String(adset?.id || ""),
      source_name: String(adset?.name || "Conjunto"),
      new_name: replaceCjToken(adset?.name || "Conjunto", cjToken),
      countries: (adset?.targeting?.geo_locations?.countries || adset?.countries || [])
        .map((code) => String(code || "").trim().toUpperCase())
        .filter((code) => /^[A-Z]{2}$/.test(code)),
      removed: false,
      ads: (adset?.ads || []).map((ad, adIndex) => {
        const anToken = `an${String(adIndex + 1).padStart(2, "0")}`;
        const withCj = replaceCjToken(ad?.name || "Anuncio", cjToken);
        const newName = /an\d+/i.test(withCj)
          ? withCj.replace(/an\d+/gi, anToken)
          : `${withCj}-${anToken}`;
        return {
          source_ad_id: String(ad?.id || ""),
          source_name: String(ad?.name || "Anuncio"),
          new_name: newName,
          removed: false,
          replacement_image_hash: "",
          replacement_image_url: "",
          url_tags: String(ad?.url_tags || ""),
          thumbnail_url: String(ad?.thumbnail_url || ""),
          page_id: String(ad?.page_id || ""),
          original_page_id: String(ad?.page_id || ""),
          instagram_actor_id: String(ad?.instagram_actor_id || ""),
        };
      }),
    };
  });
}

export function resolveManagedUrlTags({ trafficType, sourceUrlTags = "", siteUrlTags = "" } = {}) {
  const value = trafficType === "messages" ? sourceUrlTags : siteUrlTags;
  return String(value || "").trim().replace(/^\?/, "");
}
