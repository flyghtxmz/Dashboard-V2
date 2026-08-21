import { jsonResponse, getQuery, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

async function fetchAll(url) {
  const results = [];
  let next = url;
  while (next) {
    const res = await fetch(next);
    const json = await safeJson(res);
    if (!res.ok) {
      const err = new Error("Erro Meta");
      err.details = json;
      throw err;
    }
    results.push(...(json.data || []));
    next = json?.paging?.next || null;
  }
  return results;
}

function extractUrl(spec) {
  if (!spec || typeof spec !== "object") return "";
  if (spec.link_data?.link) return spec.link_data.link;
  const linkFromVideo = spec.video_data?.call_to_action?.value?.link;
  if (linkFromVideo) return linkFromVideo;
  return "";
}

function extractCreativeText(creative) {
  const spec = creative?.object_story_spec || {};
  const feed = creative?.asset_feed_spec || {};
  const firstFeedText = (items) =>
    (Array.isArray(items) ? items : []).find((item) => String(item?.text || "").trim())?.text || "";
  return {
    primary_text: String(spec?.link_data?.message ?? spec?.video_data?.message ?? spec?.template_data?.message ?? spec?.photo_data?.caption ?? firstFeedText(feed?.bodies) ?? ""),
    headline: String(spec?.link_data?.name ?? spec?.video_data?.title ?? spec?.template_data?.name ?? firstFeedText(feed?.titles) ?? ""),
    description: String(spec?.link_data?.description ?? spec?.video_data?.link_description ?? spec?.template_data?.description ?? firstFeedText(feed?.descriptions) ?? ""),
  };
}

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) {
    return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  }

  if (request.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const params = getQuery(request);
  const account_id = params.get("account_id");
  const summaryOnly = params.get("summary_only") === "1" || params.get("summary_only") === "true";
  if (!account_id) {
    return jsonResponse(400, { error: "Parametros obrigatorios: account_id" });
  }

  try {
    const baseFields = "id,name,status,effective_status,adset_id,adset_name,adset{id,name,status,effective_status,daily_budget,lifetime_budget,budget_remaining,bid_amount,bid_strategy,optimization_goal,bid_constraints,promoted_object},campaign_id,campaign_name,campaign{id,name,objective,status,effective_status,daily_budget,lifetime_budget,budget_remaining,bid_strategy}";
    const fields = summaryOnly
      ? baseFields
      : `${baseFields},updated_time,creative{url_tags,object_story_id,effective_object_story_id,link_url,object_url,asset_feed_spec,object_story_spec}`;
    const adsUrl = `${API_BASE}/${encodeURIComponent(
      account_id
    )}/ads?fields=${fields}&limit=200&access_token=${token}`;
    const ads = await fetchAll(adsUrl);

    const adsetIds = Array.from(
      new Set((ads || [])
        .filter((ad) => !ad.adset_name && !ad.adset?.name)
        .map((ad) => ad.adset_id)
        .filter(Boolean))
    );
    const campaignIds = Array.from(
      new Set((ads || [])
        .filter((ad) => !ad.campaign_name && !ad.campaign?.name)
        .map((ad) => ad.campaign_id)
        .filter(Boolean))
    );
    const nameMap = new Map();
    const chunkSize = 50;
    for (let i = 0; i < adsetIds.length; i += chunkSize) {
      const chunk = adsetIds.slice(i, i + chunkSize);
      const res = await fetch(
        `${API_BASE}/?ids=${chunk.join(",")}&fields=name&access_token=${token}`
      );
      const json = await safeJson(res);
      if (json && typeof json === "object") {
        Object.entries(json).forEach(([id, value]) => {
          if (value?.name) nameMap.set(id, value.name);
        });
      }
    }
    for (let i = 0; i < campaignIds.length; i += chunkSize) {
      const chunk = campaignIds.slice(i, i + chunkSize);
      const res = await fetch(
        `${API_BASE}/?ids=${chunk.join(",")}&fields=name&access_token=${token}`
      );
      const json = await safeJson(res);
      if (json && typeof json === "object") {
        Object.entries(json).forEach(([id, value]) => {
          if (value?.name) nameMap.set(id, value.name);
        });
      }
    }

    const rows = (ads || []).map((ad) => {
      const spec = ad?.creative?.object_story_spec || {};
      const adsetName = ad.adset_name || ad.adset?.name || nameMap.get(ad.adset_id) || "";
      const campaignName =
        ad.campaign_name || ad.campaign?.name || nameMap.get(ad.campaign_id) || "";
      const destination =
        ad?.creative?.link_url ||
        ad?.creative?.object_url ||
        extractUrl(spec);
      const creativeText = extractCreativeText(ad?.creative);
      return {
        id: ad.id,
        ad_id: ad.id,
        name: ad.name,
        status: ad.status,
        effective_status: ad.effective_status,
        adset_id: ad.adset_id,
        adset_name: adsetName,
        adset_status: ad.adset?.status || "",
        adset_effective_status: ad.adset?.effective_status || "",
        adset_daily_budget: ad.adset?.daily_budget ?? null,
        adset_lifetime_budget: ad.adset?.lifetime_budget ?? null,
        adset_budget_remaining: ad.adset?.budget_remaining ?? null,
        adset_bid_amount: ad.adset?.bid_amount ?? null,
        adset_bid_strategy: ad.adset?.bid_strategy || "",
        adset_optimization_goal: ad.adset?.optimization_goal || "",
        adset_bid_constraints: ad.adset?.bid_constraints || null,
        page_id: ad.adset?.promoted_object?.page_id
          ? String(ad.adset.promoted_object.page_id)
          : "",
        page_name: "",
        campaign_id: ad.campaign_id,
        campaign_name: campaignName,
        objective: ad.campaign?.objective || "",
        campaign_status: ad.campaign?.status || "",
        campaign_effective_status: ad.campaign?.effective_status || "",
        campaign_daily_budget: ad.campaign?.daily_budget ?? null,
        campaign_lifetime_budget: ad.campaign?.lifetime_budget ?? null,
        campaign_budget_remaining: ad.campaign?.budget_remaining ?? null,
        campaign_bid_strategy: ad.campaign?.bid_strategy || "",
        url_tags: ad?.creative?.url_tags || "",
        url: extractUrl(spec),
        object_story_id:
          ad?.creative?.effective_object_story_id ||
          ad?.creative?.object_story_id ||
          "",
        destination_url: destination || "",
        updated_time: ad.updated_time || "",
        ...creativeText,
      };
    });

    const pageIds = Array.from(new Set(rows.map((row) => row.page_id).filter(Boolean)));
    const pageNameMap = new Map();
    for (let i = 0; i < pageIds.length; i += chunkSize) {
      const chunk = pageIds.slice(i, i + chunkSize);
      const res = await fetch(
        `${API_BASE}/?ids=${chunk.join(",")}&fields=name&access_token=${token}`
      );
      const json = await safeJson(res);
      if (json && typeof json === "object") {
        Object.entries(json).forEach(([id, value]) => {
          if (value?.name) pageNameMap.set(id, value.name);
        });
      }
    }
    rows.forEach((row) => {
      if (row.page_id) row.page_name = pageNameMap.get(row.page_id) || "";
    });

    return jsonResponse(200, { code: "success", data: rows, summaryOnly });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao consultar Meta",
      details: error.details || error.message,
    });
  }
}
