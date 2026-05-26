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

function parseMaybeJson(value) {
  let parsed = value;
  for (let i = 0; i < 2; i += 1) {
    if (typeof parsed !== "string") return parsed;
    const trimmed = parsed.trim();
    if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
      return parsed;
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return parsed;
}

function collectPayloads(value, out = new Set()) {
  const current = parseMaybeJson(value);
  if (!current) return out;
  if (Array.isArray(current)) {
    current.forEach((item) => collectPayloads(item, out));
    return out;
  }
  if (typeof current !== "object") return out;

  Object.entries(current).forEach(([key, val]) => {
    if (key === "payload" && typeof val === "string" && val.trim()) {
      out.add(val.trim());
      return;
    }
    collectPayloads(val, out);
  });
  return out;
}

function formatBotPayload(ad) {
  const creative = ad?.creative || {};
  const payloads = new Set();
  collectPayloads(creative.page_welcome_message, payloads);
  collectPayloads(creative.object_story_spec, payloads);
  collectPayloads(creative.asset_feed_spec, payloads);
  return Array.from(payloads);
}

function botState(ad) {
  const configured = String(ad.configured_status || ad.status || "").toUpperCase();
  const effective = String(ad.effective_status || "").toUpperCase();
  if (ad.draft_adgroup_id || configured === "DRAFT" || effective === "DRAFT") return "RASCUNHO";
  if (configured === "ACTIVE") return "ATIVADO";
  if (configured === "PAUSED" || configured === "DISABLED" || effective === "PAUSED") return "DESATIVADO";
  if (configured === "ARCHIVED" || effective === "ARCHIVED") return "ARQUIVADO";
  if (configured === "DELETED" || effective === "DELETED") return "EXCLUIDO";
  return configured || effective || "INDEFINIDO";
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
  const accountId = params.get("account_id");
  if (!accountId) {
    return jsonResponse(400, { error: "Parametro obrigatorio: account_id" });
  }

  const fields = [
    "id",
    "name",
    "status",
    "configured_status",
    "effective_status",
    "draft_adgroup_id",
    "adset_id",
    "adset_name",
    "campaign_id",
    "campaign_name",
    "created_time",
    "updated_time",
    "creative{id,name,page_welcome_message,object_story_spec,asset_feed_spec,effective_object_story_id,object_story_id,url_tags}",
  ].join(",");

  try {
    const ads = await fetchAll(
      `${API_BASE}/${encodeURIComponent(accountId)}/ads?fields=${encodeURIComponent(
        fields
      )}&limit=200&access_token=${encodeURIComponent(token)}`
    );

    const rows = ads.map((ad) => {
      const payloads = formatBotPayload(ad);
      return {
        id: ad.id,
        ad_id: ad.id,
        ad_name: ad.name || "",
        campaign_id: ad.campaign_id || "",
        campaign_name: ad.campaign_name || "",
        adset_id: ad.adset_id || "",
        adset_name: ad.adset_name || "",
        configured_status: ad.configured_status || ad.status || "",
        effective_status: ad.effective_status || "",
        bot_state: botState(ad),
        bot_payloads: payloads,
        bot_payload_label: payloads.length ? payloads.join(", ") : "",
        creative_id: ad.creative?.id || "",
        creative_name: ad.creative?.name || "",
        has_page_welcome_message: Boolean(ad.creative?.page_welcome_message),
        created_time: ad.created_time || "",
        updated_time: ad.updated_time || "",
      };
    });

    return jsonResponse(200, { code: "success", data: rows });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao consultar carga do bot na Meta",
      details: error.details || error.message,
    });
  }
}
