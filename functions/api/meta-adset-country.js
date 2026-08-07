import { jsonResponse, readJson, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

export function replaceTargetingCountries(targeting, countries) {
  const current = targeting && typeof targeting === "object" ? targeting : {};
  const currentGeo = current.geo_locations && typeof current.geo_locations === "object"
    ? current.geo_locations
    : {};
  const geoLocations = { countries };
  if (Array.isArray(currentGeo.location_types) && currentGeo.location_types.length) {
    geoLocations.location_types = currentGeo.location_types;
  }
  return { ...current, geo_locations: geoLocations };
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  const token = getMetaToken(env);
  if (!token) return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  const body = await readJson(request);
  const adsetId = String(body?.adset_id || "").trim();
  const countries = (Array.isArray(body?.countries) ? body.countries : [])
    .map((code) => String(code || "").trim().toUpperCase())
    .filter((code, index, values) => /^[A-Z]{2}$/.test(code) && values.indexOf(code) === index);
  if (!/^\d+$/.test(adsetId) || !countries.length) {
    return jsonResponse(400, { error: "adset_id e ao menos um pais valido sao obrigatorios" });
  }

  try {
    const currentResponse = await fetch(
      `${API_BASE}/${encodeURIComponent(adsetId)}?fields=targeting&access_token=${encodeURIComponent(token)}`
    );
    const currentData = await safeJson(currentResponse);
    if (!currentResponse.ok) {
      return jsonResponse(currentResponse.status, { error: "Erro Meta", details: currentData });
    }
    const targeting = replaceTargetingCountries(currentData?.targeting, countries);
    const params = new URLSearchParams({
      targeting: JSON.stringify(targeting),
      access_token: token,
    });
    const updateResponse = await fetch(`${API_BASE}/${encodeURIComponent(adsetId)}`, {
      method: "POST",
      body: params,
    });
    const updateData = await safeJson(updateResponse);
    if (!updateResponse.ok) {
      return jsonResponse(updateResponse.status, { error: "Erro Meta", details: updateData });
    }
    return jsonResponse(200, { code: "success", adset_id: adsetId, countries, data: updateData });
  } catch (error) {
    return jsonResponse(500, { error: "Erro ao atualizar pais do conjunto", details: error?.message || String(error) });
  }
}
