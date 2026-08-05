import { jsonResponse, readJson, getMetaToken, safeJson } from "../_utils.js";
import { canAccessDomain, getSession } from "../_auth.js";
import { loadSettings } from "../_settings.js";

const API_BASE = "https://graph.facebook.com/v24.0";

function normalizeAccountId(value) {
  return String(value || "").trim().replace(/^act_/i, "");
}

function isPositiveAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateMetaCampaignCreationPayload(campaign, adsets) {
  const errors = [];
  const campaignHasDaily = campaign?.daily_budget !== undefined;
  const campaignHasLifetime = campaign?.lifetime_budget !== undefined;
  if (campaignHasDaily && campaignHasLifetime) errors.push("A campanha nao pode ter orcamento diario e vitalicio ao mesmo tempo.");
  if (campaignHasDaily && !isPositiveAmount(campaign.daily_budget)) errors.push("O orcamento diario da campanha deve ser maior que zero.");
  if (campaignHasLifetime && !isPositiveAmount(campaign.lifetime_budget)) errors.push("O orcamento vitalicio da campanha deve ser maior que zero.");
  if (campaign?.spending_limit !== undefined && !isPositiveAmount(campaign.spending_limit)) errors.push("O limite de gastos da campanha deve ser maior que zero.");
  if (!new Set(["PAUSED", "ACTIVE"]).has(String(campaign?.status || "PAUSED"))) errors.push("Status da campanha invalido.");

  const isCbo = campaignHasDaily || campaignHasLifetime;
  (Array.isArray(adsets) ? adsets : []).forEach((adset, adsetIndex) => {
    const label = `Conjunto ${adsetIndex + 1}`;
    if (!String(adset?.name || "").trim()) errors.push(`${label}: informe o nome.`);
    const countries = Array.isArray(adset?.countries) ? adset.countries.filter(Boolean) : [];
    if (!countries.length) errors.push(`${label}: selecione pelo menos um pais.`);
    const ageMin = Number(adset?.age_min);
    const ageMax = Number(adset?.age_max);
    if (!Number.isFinite(ageMin) || ageMin < 18 || ageMin > 65) errors.push(`${label}: idade minima invalida.`);
    if (!Number.isFinite(ageMax) || ageMax < 18 || ageMax > 65) errors.push(`${label}: idade maxima invalida.`);
    if (Number.isFinite(ageMin) && Number.isFinite(ageMax) && ageMin > ageMax) errors.push(`${label}: idade minima maior que a maxima.`);
    const hasDaily = adset?.daily_budget !== undefined;
    const hasLifetime = adset?.lifetime_budget !== undefined;
    if (!isCbo && !hasDaily && !hasLifetime) errors.push(`${label}: informe o orcamento.`);
    if (hasDaily && hasLifetime) errors.push(`${label}: use apenas um tipo de orcamento.`);
    if (hasDaily && !isPositiveAmount(adset.daily_budget)) errors.push(`${label}: orcamento diario deve ser maior que zero.`);
    if (hasLifetime && !isPositiveAmount(adset.lifetime_budget)) errors.push(`${label}: orcamento vitalicio deve ser maior que zero.`);
    if (["LOWEST_COST_WITH_BID_CAP", "COST_CAP"].includes(adset?.bid_strategy) && !isPositiveAmount(adset?.bid_amount)) {
      errors.push(`${label}: informe um limite de lance/CPA maior que zero.`);
    }
    if (adset?.manual_placements && !Object.values(adset.manual_placements).some(Boolean)) {
      errors.push(`${label}: selecione pelo menos um posicionamento manual.`);
    }
    if (adset?.start_time && adset?.end_time && new Date(adset.start_time).getTime() >= new Date(adset.end_time).getTime()) {
      errors.push(`${label}: o termino deve ser posterior ao inicio.`);
    }

    (Array.isArray(adset?.ads) ? adset.ads : []).forEach((ad, adIndex) => {
      const adLabel = `${label}, anuncio ${adIndex + 1}`;
      if (!String(ad?.name || "").trim()) errors.push(`${adLabel}: informe o nome.`);
      if (!String(ad?.page_id || "").trim()) errors.push(`${adLabel}: informe a Pagina do Facebook.`);
      if (!String(ad?.headline || "").trim()) errors.push(`${adLabel}: informe o titulo.`);
      if (!isHttpUrl(ad?.destination_url)) errors.push(`${adLabel}: URL de destino invalida.`);
      if (ad?.ad_format === "video") {
        if (!String(ad?.video_id || "").trim()) errors.push(`${adLabel}: informe o ID do video.`);
      } else if (!isHttpUrl(ad?.image_url)) {
        errors.push(`${adLabel}: URL da imagem invalida.`);
      }
      if (!new Set(["PAUSED", "ACTIVE"]).has(String(ad?.status || campaign?.status || "PAUSED"))) {
        errors.push(`${adLabel}: status invalido.`);
      }
    });
  });
  return errors;
}

async function createAdset(adset, campaignId, isCBO, account_id, token) {
  const ap = new URLSearchParams();
  ap.set("name", adset.name || "Conjunto");
  ap.set("campaign_id", campaignId);
  ap.set("billing_event", "IMPRESSIONS");
  ap.set("optimization_goal", adset.optimization_goal || "LINK_CLICKS");
  ap.set("bid_strategy", adset.bid_strategy || "LOWEST_COST_WITHOUT_CAP");
  ap.set("status", adset.status || "PAUSED");

  if (!isCBO) {
    if (adset.daily_budget) ap.set("daily_budget", String(adset.daily_budget));
    if (adset.lifetime_budget) ap.set("lifetime_budget", String(adset.lifetime_budget));
  }

  if (adset.bid_strategy === "LOWEST_COST_WITH_BID_CAP" || adset.bid_strategy === "COST_CAP") {
    if (adset.bid_amount) ap.set("bid_amount", String(adset.bid_amount));
  }

  if (adset.start_time) ap.set("start_time", adset.start_time);
  if (adset.end_time) ap.set("end_time", adset.end_time);

  const targeting = {};
  const countriesArr = Array.isArray(adset.countries)
    ? adset.countries
    : (adset.countries || "BR").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
  targeting.geo_locations = { countries: countriesArr };
  targeting.age_min = Number(adset.age_min) || 18;
  targeting.age_max = Number(adset.age_max) || 65;
  if (adset.genders && adset.genders.length > 0) targeting.genders = adset.genders;
  if (Array.isArray(adset.device_platforms) && adset.device_platforms.length > 0)
    targeting.device_platforms = adset.device_platforms;
  if (Array.isArray(adset.locales) && adset.locales.length > 0)
    targeting.locales = adset.locales.map(Number).filter(Boolean);

  if (adset.pixel_id) {
    ap.set("promoted_object", JSON.stringify({
      pixel_id: adset.pixel_id,
      custom_event_type: adset.conversion_event || "PURCHASE",
    }));
  }

  if (adset.manual_placements && typeof adset.manual_placements === "object") {
    const mp = adset.manual_placements;
    const publisherPlatforms = [];
    const facebookPositions = [];
    const instagramPositions = [];
    if (mp.facebook_feed) { publisherPlatforms.push("facebook"); facebookPositions.push("feed"); }
    if (mp.instagram_feed) { if (!publisherPlatforms.includes("instagram")) publisherPlatforms.push("instagram"); instagramPositions.push("stream"); }
    if (mp.facebook_stories) { if (!publisherPlatforms.includes("facebook")) publisherPlatforms.push("facebook"); facebookPositions.push("story"); }
    if (mp.instagram_stories) { if (!publisherPlatforms.includes("instagram")) publisherPlatforms.push("instagram"); instagramPositions.push("story"); }
    if (mp.facebook_reels) { if (!publisherPlatforms.includes("facebook")) publisherPlatforms.push("facebook"); facebookPositions.push("facebook_reels"); }
    if (mp.instagram_reels) { if (!publisherPlatforms.includes("instagram")) publisherPlatforms.push("instagram"); instagramPositions.push("reels"); }
    if (mp.audience_network) publisherPlatforms.push("audience_network");
    if (mp.messenger) { publisherPlatforms.push("messenger"); targeting.messenger_positions = ["messenger_home"]; }
    if (publisherPlatforms.length > 0) targeting.publisher_platforms = publisherPlatforms;
    if (facebookPositions.length > 0) targeting.facebook_positions = facebookPositions;
    if (instagramPositions.length > 0) targeting.instagram_positions = instagramPositions;
  }

  ap.set("targeting", JSON.stringify({
    ...targeting,
    targeting_automation: { advantage_audience: adset.advantage_audience === 1 ? 1 : 0 },
  }));
  ap.set("access_token", token);

  const res = await fetch(`${API_BASE}/${encodeURIComponent(account_id)}/adsets`, { method: "POST", body: ap });
  const data = await safeJson(res);
  if (!res.ok) throw Object.assign(new Error("Erro ao criar conjunto"), { details: data, status: res.status });
  return data.id;
}

async function createAd(ad, adsetId, account_id, token) {
  let objectStorySpec;
  if (ad.ad_format === "video" && ad.video_id) {
    const videoData = {
      video_id: ad.video_id,
      message: ad.body || "",
      title: ad.headline || "",
      link_description: ad.description || "",
      call_to_action: { type: ad.cta_type || "LEARN_MORE", value: { link: ad.destination_url } },
    };
    if (ad.thumb_url) videoData.image_url = ad.thumb_url;
    objectStorySpec = { page_id: ad.page_id, video_data: videoData };
  } else {
    const linkData = {
      link: ad.destination_url,
      name: ad.headline || "",
      description: ad.description || "",
      call_to_action: { type: ad.cta_type || "LEARN_MORE", value: { link: ad.destination_url } },
    };
    if (ad.body) linkData.message = ad.body;
    if (ad.image_url) linkData.picture = ad.image_url;
    objectStorySpec = { page_id: ad.page_id, link_data: linkData };
  }
  if (ad.ig_actor_id) objectStorySpec.instagram_actor_id = ad.ig_actor_id;

  const cp2 = new URLSearchParams();
  cp2.set("name", `${ad.name || "Criativo"} — criativo`);
  cp2.set("object_story_spec", JSON.stringify(objectStorySpec));
  cp2.set("access_token", token);
  const creativeRes = await fetch(`${API_BASE}/${encodeURIComponent(account_id)}/adcreatives`, { method: "POST", body: cp2 });
  const creativeData = await safeJson(creativeRes);
  if (!creativeRes.ok) throw Object.assign(new Error("Erro ao criar criativo"), { details: creativeData, status: creativeRes.status });

  const ap2 = new URLSearchParams();
  ap2.set("name", ad.name || "Anúncio");
  ap2.set("adset_id", adsetId);
  ap2.set("creative", JSON.stringify({ creative_id: creativeData.id }));
  ap2.set("status", ad.status === "ACTIVE" ? "ACTIVE" : "PAUSED");
  ap2.set("access_token", token);
  const adRes = await fetch(`${API_BASE}/${encodeURIComponent(account_id)}/ads`, { method: "POST", body: ap2 });
  const adData = await safeJson(adRes);
  if (!adRes.ok) throw Object.assign(new Error("Erro ao criar anúncio"), { details: adData, status: adRes.status });
  return adData.id;
}

export async function onRequest({ request, env }) {
  const session = await getSession(request, env);
  if (!session) {
    return jsonResponse(401, { code: "error", message: "Sessao invalida ou expirada." });
  }
  const token = getMetaToken(env);
  if (!token) return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const body = await readJson(request);
  const { account_id, campaign, adset, ad, adsets } = body || {};

  if (!account_id) return jsonResponse(400, { error: "Parametros obrigatorios: account_id" });
  if (!campaign?.name) return jsonResponse(400, { error: "Parametros obrigatorios: campaign.name" });
  if (!campaign?.objective) return jsonResponse(400, { error: "Parametros obrigatorios: campaign.objective" });

  const adsetsToCreate = Array.isArray(adsets) && adsets.length > 0
    ? adsets
    : adset ? [{ ...adset, ads: ad && ad.page_id ? [ad] : [] }] : [];

  if (session.role !== "admin") {
    const settings = await loadSettings(env);
    if (!settings.metaAccountId || normalizeAccountId(settings.metaAccountId) !== normalizeAccountId(account_id)) {
      return jsonResponse(403, {
        code: "error",
        message: "Conta Meta fora do escopo autorizado.",
      });
    }
    for (const adsetDef of adsetsToCreate) {
      const adsToValidate = Array.isArray(adsetDef?.ads) ? adsetDef.ads : [];
      for (const adDef of adsToValidate) {
        if (adDef?.destination_url && !canAccessDomain(session, adDef.destination_url)) {
          return jsonResponse(403, {
            code: "error",
            message: "URL de destino fora dos dominios permitidos para este usuario.",
          });
        }
      }
    }
  }

  const validationErrors = validateMetaCampaignCreationPayload(campaign, adsetsToCreate);
  if (validationErrors.length) {
    return jsonResponse(400, {
      code: "error",
      error: `Revise os dados antes de criar a campanha: ${validationErrors[0]}`,
      details: validationErrors,
    });
  }

  let campaignId = null;
  try {
    const cp = new URLSearchParams();
    cp.set("name", campaign.name);
    cp.set("objective", campaign.objective);
    cp.set("status", campaign.status || "PAUSED");
    cp.set("special_ad_categories", JSON.stringify(
      Array.isArray(campaign.special_ad_categories) &&
      campaign.special_ad_categories.length > 0 &&
      campaign.special_ad_categories[0] !== "NONE"
        ? campaign.special_ad_categories : []
    ));
    if (campaign.daily_budget) cp.set("daily_budget", String(campaign.daily_budget));
    if (campaign.lifetime_budget) cp.set("lifetime_budget", String(campaign.lifetime_budget));
    if (campaign.spending_limit) cp.set("spending_limit", String(campaign.spending_limit));
    if (campaign.bid_strategy) cp.set("bid_strategy", campaign.bid_strategy);
    // Obrigatorio quando nao usa orcamento de campanha (CBO)
    if (!campaign.daily_budget && !campaign.lifetime_budget) {
      cp.set("is_adset_budget_sharing_enabled", "false");
    }
    cp.set("access_token", token);
    const campRes = await fetch(`${API_BASE}/${encodeURIComponent(account_id)}/campaigns`, { method: "POST", body: cp });
    const campData = await safeJson(campRes);
    if (!campRes.ok) return jsonResponse(campRes.status, { error: "Erro ao criar campanha", details: campData });
    campaignId = campData.id;
  } catch (err) {
    return jsonResponse(500, { error: "Erro ao criar campanha", details: err.message });
  }

  if (adsetsToCreate.length === 0) {
    return jsonResponse(200, { code: "success", campaign_id: campaignId });
  }

  const isCBO = Boolean(campaign.daily_budget || campaign.lifetime_budget);
  const results = [];
  let anyError = false;

  for (const adsetDef of adsetsToCreate) {
    const adsetResult = { name: adsetDef.name, adset_id: null, ads: [], error: null };
    try {
      adsetResult.adset_id = await createAdset(adsetDef, campaignId, isCBO, account_id, token);
    } catch (err) {
      adsetResult.error = err.details || err.message;
      anyError = true;
      results.push(adsetResult);
      continue;
    }

    const adsToCreate = Array.isArray(adsetDef.ads) ? adsetDef.ads : [];
    for (const adDef of adsToCreate) {
      if (!adDef.page_id) continue;
      try {
        const adId = await createAd(adDef, adsetResult.adset_id, account_id, token);
        adsetResult.ads.push({ name: adDef.name, ad_id: adId });
      } catch (err) {
        adsetResult.ads.push({ name: adDef.name, ad_id: null, error: err.details || err.message });
        anyError = true;
      }
    }
    results.push(adsetResult);
  }

  const first = results[0] || {};
  const firstAd = first.ads?.[0] || {};
  return jsonResponse(200, {
    code: anyError ? "partial" : "success",
    campaign_id: campaignId,
    adset_id: first.adset_id || null,
    ad_id: firstAd.ad_id || null,
    results,
  });
}
