import { jsonResponse, readJson, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";
const VALID_STATUSES = new Set(["ACTIVE", "PAUSED", "INHERITED_FROM_SOURCE"]);
const VALID_RENAME_STRATEGIES = new Set(["DEEP_RENAME", "ONLY_TOP_LEVEL_RENAME", "NO_RENAME"]);

export function normalizeCampaignCopyResponse(data) {
  const mappings = Array.isArray(data?.ad_object_ids)
    ? data.ad_object_ids
        .map((item) => ({
          type: String(item?.ad_object_type || "").trim(),
          source_id: String(item?.source_id || "").trim(),
          copied_id: String(item?.copied_id || "").trim(),
        }))
        .filter((item) => item.source_id && item.copied_id)
    : [];
  const campaignMapping = mappings.find((item) => item.type === "campaign");
  return {
    copied_campaign_id: String(data?.copied_campaign_id || campaignMapping?.copied_id || "").trim(),
    mappings,
  };
}

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const body = await readJson(request);
  const campaignId = String(body?.campaign_id || "").trim();
  const deepCopy = body?.deep_copy !== false;
  const statusOption = String(body?.status_option || "PAUSED").toUpperCase();
  const renameStrategy = String(body?.rename_strategy || "NO_RENAME").toUpperCase();
  if (!/^\d+$/.test(campaignId)) {
    return jsonResponse(400, { error: "Parametro obrigatorio: campaign_id" });
  }
  if (!VALID_STATUSES.has(statusOption)) {
    return jsonResponse(400, { error: "status_option invalido" });
  }
  if (!VALID_RENAME_STRATEGIES.has(renameStrategy)) {
    return jsonResponse(400, { error: "rename_strategy invalido" });
  }

  try {
    const params = new URLSearchParams({
      deep_copy: deepCopy ? "true" : "false",
      status_option: statusOption,
      rename_strategy: renameStrategy,
      access_token: token,
    });
    if (body?.rename_options && typeof body.rename_options === "object") {
      params.set("rename_options", JSON.stringify(body.rename_options));
    }
    const response = await fetch(`${API_BASE}/${encodeURIComponent(campaignId)}/copies`, {
      method: "POST",
      body: params,
    });
    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, { error: "Erro Meta", details: data });
    }
    const normalized = normalizeCampaignCopyResponse(data);
    if (!normalized.copied_campaign_id) {
      return jsonResponse(502, {
        error: "A Meta nao informou o ID da campanha duplicada.",
        details: data,
      });
    }
    return jsonResponse(200, { code: "success", data, ...normalized });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao duplicar campanha",
      details: error?.message || String(error),
    });
  }
}
