import { jsonResponse, readJson, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";
const BID_STRATEGIES = new Set(["LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP"]);

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  const token = getMetaToken(env);
  if (!token) return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  const body = await readJson(request);
  const accountId = String(body?.account_id || "").trim();
  const campaignId = String(body?.campaign_id || "").trim();
  const adset = body?.adset || {};
  if (!accountId || !campaignId || !String(adset.name || "").trim()) {
    return jsonResponse(400, { error: "Parametros obrigatorios: account_id, campaign_id e adset.name" });
  }
  const countries = (Array.isArray(adset.countries) ? adset.countries : [])
    .map((value) => String(value || "").trim().toUpperCase())
    .filter((value) => /^[A-Z]{2}$/.test(value));
  if (!countries.length) return jsonResponse(400, { error: "Informe ao menos um pais valido." });
  const ageMin = Math.max(18, Math.min(65, Number(adset.age_min) || 18));
  const ageMax = Math.max(ageMin, Math.min(65, Number(adset.age_max) || 65));
  const optimizationGoal = String(adset.optimization_goal || "OFFSITE_CONVERSIONS");
  if (optimizationGoal === "OFFSITE_CONVERSIONS" && !String(adset.pixel_id || "").trim()) {
    return jsonResponse(400, { error: "Selecione um pixel para otimizar por conversoes." });
  }
  const bidStrategy = BID_STRATEGIES.has(String(adset.bid_strategy || ""))
    ? String(adset.bid_strategy)
    : "LOWEST_COST_WITHOUT_CAP";
  const params = new URLSearchParams();
  params.set("name", String(adset.name).trim());
  params.set("campaign_id", campaignId);
  params.set("billing_event", "IMPRESSIONS");
  params.set("optimization_goal", optimizationGoal);
  params.set("bid_strategy", bidStrategy);
  params.set("status", adset.status === "ACTIVE" ? "ACTIVE" : "PAUSED");
  params.set("destination_type", "WEBSITE");
  if (!body.is_cbo) {
    const dailyBudget = Math.round(Number(adset.daily_budget));
    if (!Number.isFinite(dailyBudget) || dailyBudget < 100) {
      return jsonResponse(400, { error: "Informe um orcamento diario de pelo menos R$ 1,00." });
    }
    params.set("daily_budget", String(dailyBudget));
  }
  if ((bidStrategy === "LOWEST_COST_WITH_BID_CAP" || bidStrategy === "COST_CAP") && Number(adset.bid_amount) > 0) {
    params.set("bid_amount", String(Math.round(Number(adset.bid_amount))));
  }
  const targeting = {
    geo_locations: { countries },
    age_min: ageMin,
    age_max: ageMax,
    targeting_automation: { advantage_audience: adset.advantage_audience === 1 ? 1 : 0 },
  };
  if (Array.isArray(adset.genders) && adset.genders.length) targeting.genders = adset.genders.map(Number).filter((value) => value === 1 || value === 2);
  if (Array.isArray(adset.locales) && adset.locales.length) targeting.locales = adset.locales.map(Number).filter(Boolean);
  if (Array.isArray(adset.device_platforms) && adset.device_platforms.length) targeting.device_platforms = adset.device_platforms;
  params.set("targeting", JSON.stringify(targeting));
  if (adset.pixel_id) {
    params.set("promoted_object", JSON.stringify({
      pixel_id: String(adset.pixel_id),
      custom_event_type: String(adset.conversion_event || "PURCHASE"),
    }));
  }
  params.set("access_token", token);

  try {
    const act = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const response = await fetch(`${API_BASE}/${encodeURIComponent(act)}/adsets`, { method: "POST", body: params });
    const data = await safeJson(response);
    if (!response.ok) return jsonResponse(response.status, { error: "Erro Meta", details: data });
    return jsonResponse(200, { code: "success", adset_id: data.id, data });
  } catch (error) {
    return jsonResponse(500, { error: "Erro ao criar conjunto", details: error.message });
  }
}
