import { jsonResponse, readJson, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

async function deleteObject(id, token) {
  try {
    await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: new URLSearchParams({ access_token: token }),
    });
  } catch (_) {
    // best-effort rollback
  }
}

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) {
    return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const body = await readJson(request);
  const { account_id, campaign, adset, ad } = body || {};

  if (!account_id) {
    return jsonResponse(400, { error: "Parametros obrigatorios: account_id" });
  }
  if (!campaign?.name) {
    return jsonResponse(400, { error: "Parametros obrigatorios: campaign.name" });
  }
  if (!campaign?.objective) {
    return jsonResponse(400, { error: "Parametros obrigatorios: campaign.objective" });
  }

  // ── STEP 1: Criar campanha ───────────────────────────────────────────────
  let campaignId = null;
  try {
    const cp = new URLSearchParams();
    cp.set("name", campaign.name);
    cp.set("objective", campaign.objective);
    cp.set("status", campaign.status || "PAUSED");
    cp.set(
      "special_ad_categories",
      JSON.stringify(
        Array.isArray(campaign.special_ad_categories) &&
        campaign.special_ad_categories.length > 0 &&
        campaign.special_ad_categories[0] !== "NONE"
          ? campaign.special_ad_categories
          : []
      )
    );
    if (campaign.daily_budget) cp.set("daily_budget", String(campaign.daily_budget));
    if (campaign.lifetime_budget) cp.set("lifetime_budget", String(campaign.lifetime_budget));
    if (campaign.spending_limit) cp.set("spending_limit", String(campaign.spending_limit));
    if (campaign.bid_strategy) cp.set("bid_strategy", campaign.bid_strategy);
    cp.set("access_token", token);

    const campRes = await fetch(
      `${API_BASE}/${encodeURIComponent(account_id)}/campaigns`,
      { method: "POST", body: cp }
    );
    const campData = await safeJson(campRes);
    if (!campRes.ok) {
      return jsonResponse(campRes.status, {
        error: "Erro ao criar campanha",
        details: campData,
      });
    }
    campaignId = campData.id;
  } catch (err) {
    return jsonResponse(500, { error: "Erro ao criar campanha", details: err.message });
  }

  if (!adset) {
    return jsonResponse(200, { code: "success", campaign_id: campaignId });
  }

  // ── STEP 2: Criar conjunto ───────────────────────────────────────────────
  let adsetId = null;
  try {
    const ap = new URLSearchParams();
    ap.set("name", adset.name || `${campaign.name} — Conjunto`);
    ap.set("campaign_id", campaignId);
    ap.set("billing_event", "IMPRESSIONS");
    ap.set("optimization_goal", adset.optimization_goal || "LINK_CLICKS");
    ap.set("bid_strategy", adset.bid_strategy || "LOWEST_COST_WITHOUT_CAP");
    ap.set("status", adset.status || "PAUSED");

    // Orçamento no adset somente se não for CBO
    const isCBO = Boolean(campaign.daily_budget || campaign.lifetime_budget);
    if (!isCBO) {
      if (adset.daily_budget) ap.set("daily_budget", String(adset.daily_budget));
      if (adset.lifetime_budget) ap.set("lifetime_budget", String(adset.lifetime_budget));
    }

    if (
      adset.bid_strategy === "LOWEST_COST_WITH_BID_CAP" ||
      adset.bid_strategy === "COST_CAP"
    ) {
      if (adset.bid_amount) ap.set("bid_amount", String(adset.bid_amount));
    }

    if (adset.start_time) ap.set("start_time", adset.start_time);
    if (adset.end_time) ap.set("end_time", adset.end_time);

    // Targeting
    const targeting = {};
    const countriesArr = Array.isArray(adset.countries)
      ? adset.countries
      : (adset.countries || "BR").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    targeting.geo_locations = { countries: countriesArr };
    targeting.age_min = Number(adset.age_min) || 18;
    targeting.age_max = Number(adset.age_max) || 65;
    if (adset.genders && adset.genders.length > 0) {
      targeting.genders = adset.genders;
    }

    // Dispositivos
    if (Array.isArray(adset.device_platforms) && adset.device_platforms.length > 0) {
      targeting.device_platforms = adset.device_platforms;
    }

    // Pixel / promoted_object
    if (adset.pixel_id) {
      ap.set("promoted_object", JSON.stringify({
        pixel_id: adset.pixel_id,
        custom_event_type: adset.conversion_event || "PURCHASE",
      }));
    }

    // Posicionamentos manuais
    if (adset.manual_placements && typeof adset.manual_placements === "object") {
      const mp = adset.manual_placements;
      const publisherPlatforms = [];
      const facebookPositions = [];
      const instagramPositions = [];

      if (mp.facebook_feed) {
        publisherPlatforms.push("facebook");
        facebookPositions.push("feed");
      }
      if (mp.instagram_feed) {
        if (!publisherPlatforms.includes("instagram")) publisherPlatforms.push("instagram");
        instagramPositions.push("stream");
      }
      if (mp.facebook_stories) {
        if (!publisherPlatforms.includes("facebook")) publisherPlatforms.push("facebook");
        facebookPositions.push("story");
      }
      if (mp.instagram_stories) {
        if (!publisherPlatforms.includes("instagram")) publisherPlatforms.push("instagram");
        instagramPositions.push("story");
      }
      if (mp.facebook_reels) {
        if (!publisherPlatforms.includes("facebook")) publisherPlatforms.push("facebook");
        facebookPositions.push("facebook_reels");
      }
      if (mp.instagram_reels) {
        if (!publisherPlatforms.includes("instagram")) publisherPlatforms.push("instagram");
        instagramPositions.push("reels");
      }
      if (mp.audience_network) {
        publisherPlatforms.push("audience_network");
      }
      if (mp.messenger) {
        publisherPlatforms.push("messenger");
        targeting.messenger_positions = ["messenger_home"];
      }

      if (publisherPlatforms.length > 0) {
        targeting.publisher_platforms = publisherPlatforms;
      }
      if (facebookPositions.length > 0) {
        targeting.facebook_positions = facebookPositions;
      }
      if (instagramPositions.length > 0) {
        targeting.instagram_positions = instagramPositions;
      }
    }

    ap.set("targeting", JSON.stringify(targeting));
    ap.set("access_token", token);

    const adsetRes = await fetch(
      `${API_BASE}/${encodeURIComponent(account_id)}/adsets`,
      { method: "POST", body: ap }
    );
    const adsetData = await safeJson(adsetRes);
    if (!adsetRes.ok) {
      await deleteObject(campaignId, token);
      return jsonResponse(adsetRes.status, {
        error: "Erro ao criar conjunto (campanha revertida)",
        details: adsetData,
      });
    }
    adsetId = adsetData.id;
  } catch (err) {
    await deleteObject(campaignId, token);
    return jsonResponse(500, {
      error: "Erro ao criar conjunto (campanha revertida)",
      details: err.message,
    });
  }

  if (!ad || !ad.page_id) {
    return jsonResponse(200, {
      code: "success",
      campaign_id: campaignId,
      adset_id: adsetId,
    });
  }

  // ── STEP 3: Criar criativo + anúncio ────────────────────────────────────
  try {
    let objectStorySpec;

    if (ad.ad_format === "video" && ad.video_id) {
      const videoData = {
        video_id: ad.video_id,
        message: ad.body || "",
        title: ad.headline || "",
        link_description: ad.description || "",
        call_to_action: {
          type: ad.cta_type || "LEARN_MORE",
          value: { link: ad.destination_url },
        },
      };
      if (ad.thumb_url) videoData.image_url = ad.thumb_url;
      objectStorySpec = {
        page_id: ad.page_id,
        video_data: videoData,
      };
    } else {
      const linkData = {
        link: ad.destination_url,
        name: ad.headline || "",
        description: ad.description || "",
        call_to_action: {
          type: ad.cta_type || "LEARN_MORE",
          value: { link: ad.destination_url },
        },
      };
      if (ad.body) linkData.message = ad.body;
      if (ad.image_url) linkData.picture = ad.image_url;
      objectStorySpec = {
        page_id: ad.page_id,
        link_data: linkData,
      };
    }

    if (ad.ig_actor_id) {
      objectStorySpec.instagram_actor_id = ad.ig_actor_id;
    }

    const cp2 = new URLSearchParams();
    cp2.set("name", `${ad.name || "Criativo"} — criativo`);
    cp2.set("object_story_spec", JSON.stringify(objectStorySpec));
    cp2.set("access_token", token);

    const creativeRes = await fetch(
      `${API_BASE}/${encodeURIComponent(account_id)}/adcreatives`,
      { method: "POST", body: cp2 }
    );
    const creativeData = await safeJson(creativeRes);
    if (!creativeRes.ok) {
      return jsonResponse(creativeRes.status, {
        code: "partial",
        error: "Campanha e conjunto criados, mas erro ao criar criativo",
        details: creativeData,
        campaign_id: campaignId,
        adset_id: adsetId,
      });
    }

    const ap2 = new URLSearchParams();
    ap2.set("name", ad.name || "Anuncio novo");
    ap2.set("adset_id", adsetId);
    ap2.set("creative", JSON.stringify({ creative_id: creativeData.id }));
    ap2.set("status", "PAUSED");
    ap2.set("access_token", token);

    const adRes = await fetch(
      `${API_BASE}/${encodeURIComponent(account_id)}/ads`,
      { method: "POST", body: ap2 }
    );
    const adData = await safeJson(adRes);
    if (!adRes.ok) {
      return jsonResponse(adRes.status, {
        code: "partial",
        error: "Campanha e conjunto criados, mas erro ao criar anuncio",
        details: adData,
        campaign_id: campaignId,
        adset_id: adsetId,
      });
    }

    return jsonResponse(200, {
      code: "success",
      campaign_id: campaignId,
      adset_id: adsetId,
      ad_id: adData.id,
    });
  } catch (err) {
    return jsonResponse(500, {
      code: "partial",
      error: "Campanha e conjunto criados, mas erro ao criar anuncio",
      details: err.message,
      campaign_id: campaignId,
      adset_id: adsetId,
    });
  }
}
