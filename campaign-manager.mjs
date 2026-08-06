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
