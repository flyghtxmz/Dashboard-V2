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
  if (!account_id) {
    return jsonResponse(400, { error: "Parametros obrigatorios: account_id" });
  }

  try {
    const adsUrl = `${API_BASE}/${encodeURIComponent(
      account_id
    )}/ads?fields=id,name,status,effective_status,adset_id,adset_name,campaign_id,campaign_name,creative{url_tags,object_story_spec{link_data{link},video_data{call_to_action}}}&limit=200&access_token=${token}`;
    const ads = await fetchAll(adsUrl);

    const adsetIds = Array.from(
      new Set((ads || []).map((ad) => ad.adset_id).filter(Boolean))
    );
    const campaignIds = Array.from(
      new Set((ads || []).map((ad) => ad.campaign_id).filter(Boolean))
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
      const adsetName = ad.adset_name || nameMap.get(ad.adset_id) || "";
      const campaignName =
        ad.campaign_name || nameMap.get(ad.campaign_id) || "";
      return {
        id: ad.id,
        name: ad.name,
        status: ad.status,
        effective_status: ad.effective_status,
        adset_id: ad.adset_id,
        adset_name: adsetName,
        campaign_id: ad.campaign_id,
        campaign_name: campaignName,
        url_tags: ad?.creative?.url_tags || "",
        url: extractUrl(spec),
      };
    });

    return jsonResponse(200, { code: "success", data: rows });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao consultar Meta",
      details: error.details || error.message,
    });
  }
}
