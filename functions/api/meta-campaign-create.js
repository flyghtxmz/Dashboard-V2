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
  const adsetList = Array.isArray(adsets) ? adsets : [];
  const supportedObjectives = new Set([
    "OUTCOME_TRAFFIC",
    "OUTCOME_SALES",
    "OUTCOME_LEADS",
    "OUTCOME_ENGAGEMENT",
    "OUTCOME_AWARENESS",
    "OUTCOME_APP_PROMOTION",
  ]);
  if (!supportedObjectives.has(String(campaign?.objective || ""))) errors.push("Objetivo da campanha invalido.");
  if (adsetList.length > 50) errors.push("Uma publicacao pode conter no maximo 50 conjuntos.");
  const totalAds = adsetList.reduce((sum, item) => sum + (Array.isArray(item?.ads) ? item.ads.length : 0), 0);
  if (totalAds > 200) errors.push("Uma publicacao pode conter no maximo 200 anuncios materializados.");
  const campaignHasDaily = campaign?.daily_budget !== undefined;
  const campaignHasLifetime = campaign?.lifetime_budget !== undefined;
  if (campaignHasDaily && campaignHasLifetime) errors.push("A campanha nao pode ter orcamento diario e vitalicio ao mesmo tempo.");
  if (campaignHasDaily && !isPositiveAmount(campaign.daily_budget)) errors.push("O orcamento diario da campanha deve ser maior que zero.");
  if (campaignHasLifetime && !isPositiveAmount(campaign.lifetime_budget)) errors.push("O orcamento vitalicio da campanha deve ser maior que zero.");
  if (campaign?.spend_cap !== undefined && !isPositiveAmount(campaign.spend_cap)) errors.push("O limite de gastos da campanha deve ser maior que zero.");
  if (!new Set(["PAUSED", "ACTIVE"]).has(String(campaign?.status || "PAUSED"))) errors.push("Status da campanha invalido.");

  const isCbo = campaignHasDaily || campaignHasLifetime;
  adsetList.forEach((adset, adsetIndex) => {
    const label = `Conjunto ${adsetIndex + 1}`;
    if (!String(adset?.name || "").trim()) errors.push(`${label}: informe o nome.`);
    const countries = Array.isArray(adset?.countries) ? adset.countries.filter(Boolean) : [];
    if (!countries.length) errors.push(`${label}: selecione pelo menos um pais.`);
    if (countries.some((code) => !/^[A-Z]{2}$/.test(String(code || "").trim().toUpperCase()))) {
      errors.push(`${label}: use codigos ISO de dois caracteres para os paises.`);
    }
    const destinationType = String(adset?.destination_type || "WEBSITE").toUpperCase();
    if (destinationType !== "WEBSITE") {
      errors.push(`${label}: o adaptador ${destinationType} ainda nao esta habilitado para publicacao.`);
    }
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
    if (hasLifetime && !adset?.end_time) errors.push(`${label}: informe o termino para usar orcamento vitalicio.`);
    if (adset?.optimization_goal === "OFFSITE_CONVERSIONS" && !String(adset?.pixel_id || "").trim()) {
      errors.push(`${label}: selecione um pixel para otimizar conversoes no site.`);
    }
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
      if (String(ad?.destination_type || destinationType).toUpperCase() !== destinationType) {
        errors.push(`${adLabel}: o destino diverge do conjunto.`);
      }
      if (!String(ad?.name || "").trim()) errors.push(`${adLabel}: informe o nome.`);
      if (!String(ad?.page_id || "").trim()) errors.push(`${adLabel}: informe a Pagina do Facebook.`);
      if (!String(ad?.headline || "").trim()) errors.push(`${adLabel}: informe o titulo.`);
      if (!isHttpUrl(ad?.destination_url)) errors.push(`${adLabel}: URL de destino invalida.`);
      if (String(ad?.url_tags || "").startsWith("?")) errors.push(`${adLabel}: remova o ? inicial dos parametros de URL.`);
      if (String(ad?.url_tags || "").length > 2000) errors.push(`${adLabel}: parametros de URL muito longos.`);
      if (ad?.ad_format === "video") {
        if (!String(ad?.video_id || "").trim()) errors.push(`${adLabel}: informe o ID do video.`);
      } else if (!String(ad?.image_hash || "").trim() && !isHttpUrl(ad?.image_url)) {
        errors.push(`${adLabel}: selecione uma imagem da biblioteca Meta ou informe uma URL valida.`);
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
  ap.set("destination_type", adset.destination_type || "WEBSITE");

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
    if (ad.image_hash) linkData.image_hash = String(ad.image_hash).trim();
    else if (ad.image_url) linkData.picture = ad.image_url;
    objectStorySpec = { page_id: ad.page_id, link_data: linkData };
  }
  if (ad.ig_actor_id) objectStorySpec.instagram_actor_id = ad.ig_actor_id;

  const cp2 = new URLSearchParams();
  cp2.set("name", `${ad.name || "Criativo"} — criativo`);
  cp2.set("object_story_spec", JSON.stringify(objectStorySpec));
  if (ad.url_tags) cp2.set("url_tags", String(ad.url_tags).replace(/^\?/, ""));
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

async function verifyCreatedObjects(ids, token) {
  const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String))];
  if (!uniqueIds.length) return { ok: true, checked: 0, found: 0, missing_ids: [] };
  const found = new Set();
  const errors = [];
  for (let index = 0; index < uniqueIds.length; index += 50) {
    const chunk = uniqueIds.slice(index, index + 50);
    const params = new URLSearchParams({
      ids: chunk.join(","),
      fields: "id,name,status,effective_status",
      access_token: token,
    });
    try {
      const response = await fetch(`${API_BASE}/?${params.toString()}`);
      const data = await safeJson(response);
      if (!response.ok) {
        errors.push(data);
        continue;
      }
      Object.keys(data || {}).forEach((id) => found.add(String(id)));
    } catch (error) {
      errors.push(error.message);
    }
  }
  const missing = uniqueIds.filter((id) => !found.has(id));
  return {
    ok: errors.length === 0 && missing.length === 0,
    checked: uniqueIds.length,
    found: found.size,
    missing_ids: missing,
    errors,
  };
}

async function ensureCreationRunsTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS campaign_creation_runs (
    request_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    actor TEXT,
    campaign_name TEXT NOT NULL,
    status TEXT NOT NULL,
    request_payload TEXT NOT NULL,
    response_payload TEXT,
    campaign_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_campaign_creation_runs_account
    ON campaign_creation_runs(account_id, created_at DESC)`).run();
}

async function beginCreationRun(db, { requestId, accountId, actor, campaignName, payload }) {
  if (!db || !requestId) return { owned: true, tracked: false };
  await ensureCreationRunsTable(db);
  const now = new Date().toISOString();
  const insert = await db.prepare(`INSERT OR IGNORE INTO campaign_creation_runs
    (request_id, account_id, actor, campaign_name, status, request_payload, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, 'PUBLISHING', ?5, ?6, ?6)`)
    .bind(requestId, accountId, actor || null, campaignName, JSON.stringify(payload), now)
    .run();
  if (Number(insert?.meta?.changes || 0) > 0) return { owned: true, tracked: true };

  const existing = await db.prepare(`SELECT status, response_payload, campaign_id, updated_at
    FROM campaign_creation_runs WHERE request_id = ?1`).bind(requestId).first();
  if (existing?.response_payload) {
    try {
      return { owned: false, tracked: true, response: JSON.parse(existing.response_payload) };
    } catch {
      return { owned: false, tracked: true, conflict: true, existing };
    }
  }
  return { owned: false, tracked: true, conflict: true, existing };
}

async function finishCreationRun(db, requestId, status, payload, campaignId = null) {
  if (!db || !requestId) return;
  await db.prepare(`UPDATE campaign_creation_runs
    SET status = ?2, response_payload = ?3, campaign_id = ?4, updated_at = ?5
    WHERE request_id = ?1`)
    .bind(requestId, status, JSON.stringify(payload), campaignId || null, new Date().toISOString())
    .run();
}

async function updateCreationRunStage(db, requestId, status, campaignId = null) {
  if (!db || !requestId) return;
  await db.prepare(`UPDATE campaign_creation_runs
    SET status = ?2, campaign_id = COALESCE(?3, campaign_id), updated_at = ?4
    WHERE request_id = ?1`)
    .bind(requestId, status, campaignId || null, new Date().toISOString())
    .run();
}

async function mapWithConcurrency(items, limit, mapper) {
  const source = Array.isArray(items) ? items : [];
  const results = new Array(source.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < source.length) {
      const index = cursor++;
      results[index] = await mapper(source[index], index);
    }
  };
  const workerCount = Math.min(Math.max(1, Number(limit) || 1), source.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

export async function onRequest({ request, env }) {
  const session = await getSession(request, env);
  if (!session) {
    return jsonResponse(401, { code: "error", message: "Sessao invalida ou expirada." });
  }
  if (request.method === "GET") {
    const requestId = new URL(request.url).searchParams.get("request_id") || "";
    const db = env.DASHBOARD_DB || null;
    if (!db || !requestId) {
      return jsonResponse(400, { code: "error", error: "request_id e banco sao obrigatorios." });
    }
    await ensureCreationRunsTable(db);
    const row = await db.prepare(`SELECT request_id, account_id, campaign_name, status,
      response_payload, campaign_id, created_at, updated_at
      FROM campaign_creation_runs WHERE request_id = ?1`).bind(requestId).first();
    if (!row) return jsonResponse(404, { code: "error", error: "Publicacao nao encontrada." });
    let response = null;
    try { response = row.response_payload ? JSON.parse(row.response_payload) : null; } catch { response = null; }
    return jsonResponse(200, { code: "success", data: { ...row, response_payload: undefined, response } });
  }
  const token = getMetaToken(env);
  if (!token) return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const body = await readJson(request);
  const { request_id, account_id, campaign, adset, ad, adsets } = body || {};

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

  const db = env.DASHBOARD_DB || null;
  const requestId = String(request_id || "").trim();
  if (!db) {
    return jsonResponse(503, { code: "error", error: "DASHBOARD_DB nao configurado para publicar com seguranca." });
  }
  if (!requestId) {
    return jsonResponse(400, { code: "error", error: "request_id e obrigatorio para evitar publicacao duplicada." });
  }
  if (requestId.length > 160) {
    return jsonResponse(400, { code: "error", error: "Identificador de publicacao invalido." });
  }
  let run;
  try {
    run = await beginCreationRun(db, {
      requestId,
      accountId: normalizeAccountId(account_id),
      actor: session.username || session.email || session.role,
      campaignName: campaign.name,
      payload: body,
    });
  } catch (error) {
    return jsonResponse(503, {
      code: "error",
      error: "Nao foi possivel registrar a publicacao com seguranca.",
      details: error.message,
    });
  }
  if (run?.response) {
    return jsonResponse(200, { ...run.response, replayed: true });
  }
  if (run?.conflict) {
    return jsonResponse(409, {
      code: "publishing",
      error: "Esta publicacao ja foi iniciada. Aguarde ou consulte o historico antes de tentar novamente.",
      existing: run.existing,
    });
  }

  const persistenceWarnings = [];
  const recordStage = async (status, id = null) => {
    try {
      await updateCreationRunStage(db, requestId, status, id);
    } catch (error) {
      persistenceWarnings.push(`Nao foi possivel registrar a etapa ${status}: ${error.message}`);
    }
  };
  const finish = async (httpStatus, status, payload, id = null) => {
    const responsePayload = persistenceWarnings.length
      ? { ...payload, persistence_warnings: [...persistenceWarnings] }
      : payload;
    try {
      await finishCreationRun(db, requestId, status, responsePayload, id);
    } catch (error) {
      responsePayload.persistence_warnings = [
        ...(responsePayload.persistence_warnings || []),
        `Nao foi possivel finalizar o historico: ${error.message}`,
      ];
    }
    return jsonResponse(httpStatus, responsePayload);
  };

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
    if (campaign.spend_cap) cp.set("spend_cap", String(campaign.spend_cap));
    if (campaign.bid_strategy) cp.set("bid_strategy", campaign.bid_strategy);
    // Obrigatorio quando nao usa orcamento de campanha (CBO)
    if (!campaign.daily_budget && !campaign.lifetime_budget) {
      cp.set("is_adset_budget_sharing_enabled", "false");
    }
    cp.set("access_token", token);
    const campRes = await fetch(`${API_BASE}/${encodeURIComponent(account_id)}/campaigns`, { method: "POST", body: cp });
    const campData = await safeJson(campRes);
    if (!campRes.ok) return finish(campRes.status, "FAILED", { error: "Erro ao criar campanha", details: campData });
    campaignId = campData.id;
    await recordStage("CAMPAIGN_CREATED", campaignId);
  } catch (err) {
    const payload = campaignId
      ? { error: "A campanha foi criada, mas o registro da publicacao falhou.", campaign_id: campaignId, details: err.message }
      : { error: "Erro ao criar campanha", details: err.message };
    return finish(500, campaignId ? "CREATED_UNVERIFIED" : "FAILED", payload, campaignId);
  }

  if (adsetsToCreate.length === 0) {
    const verification = await verifyCreatedObjects([campaignId], token);
    const payload = { code: "success", campaign_id: campaignId, verification };
    return finish(200, verification.ok ? "VERIFIED" : "CREATED_UNVERIFIED", payload, campaignId);
  }

  const isCBO = Boolean(campaign.daily_budget || campaign.lifetime_budget);
  let results = [];
  let anyError = false;

  results = await mapWithConcurrency(adsetsToCreate, 3, async (adsetDef) => {
    const adsetResult = { name: adsetDef.name, adset_id: null, ads: [], error: null };
    try {
      adsetResult.adset_id = await createAdset(adsetDef, campaignId, isCBO, account_id, token);
    } catch (err) {
      adsetResult.error = err.details || err.message;
      anyError = true;
    }
    return adsetResult;
  });

  await recordStage(anyError ? "ADSETS_PARTIAL" : "ADSETS_CREATED", campaignId);

  const adTasks = results.flatMap((adsetResult, adsetIndex) => {
    if (!adsetResult.adset_id) return [];
    const adsToCreate = Array.isArray(adsetsToCreate[adsetIndex]?.ads)
      ? adsetsToCreate[adsetIndex].ads
      : [];
    adsetResult.ads = new Array(adsToCreate.length);
    return adsToCreate.map((adDef, adIndex) => ({ adDef, adIndex, adsetResult }));
  });

  await mapWithConcurrency(adTasks, 4, async ({ adDef, adIndex, adsetResult }) => {
    try {
      const adId = await createAd(adDef, adsetResult.adset_id, account_id, token);
      adsetResult.ads[adIndex] = { name: adDef.name, ad_id: adId };
    } catch (err) {
      adsetResult.ads[adIndex] = { name: adDef.name, ad_id: null, error: err.details || err.message };
      anyError = true;
    }
  });
  results.forEach((item) => { item.ads = (item.ads || []).filter(Boolean); });

  const first = results[0] || {};
  const firstAd = first.ads?.[0] || {};
  const createdIds = [
    campaignId,
    ...results.flatMap((item) => [
      item.adset_id,
      ...(item.ads || []).map((adItem) => adItem.ad_id),
    ]),
  ].filter(Boolean);
  const verification = await verifyCreatedObjects(createdIds, token);
  const responsePayload = {
    code: anyError ? "partial" : "success",
    campaign_id: campaignId,
    adset_id: first.adset_id || null,
    ad_id: firstAd.ad_id || null,
    results,
    verification,
  };
  return finish(
    200,
    anyError ? "PARTIAL" : verification.ok ? "VERIFIED" : "CREATED_UNVERIFIED",
    responsePayload,
    campaignId
  );
}
