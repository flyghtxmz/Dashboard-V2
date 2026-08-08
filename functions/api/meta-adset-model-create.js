import { jsonResponse, readJson, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";
const COPY_FIELDS = [
  "billing_event",
  "optimization_goal",
  "bid_strategy",
  "bid_amount",
  "targeting",
  "promoted_object",
  "destination_type",
  "attribution_spec",
  "daily_budget",
  "lifetime_budget",
  "end_time",
  "pacing_type",
];

export function buildModeledAdsetParams(source, { campaignId, name, pageId, status = "PAUSED" }) {
  const params = new URLSearchParams();
  params.set("name", String(name || source?.name || "Conjunto").trim());
  params.set("campaign_id", String(campaignId));
  params.set("status", status === "ACTIVE" ? "ACTIVE" : "PAUSED");
  for (const field of COPY_FIELDS) {
    if (field === "promoted_object") continue;
    const value = source?.[field];
    if (value === undefined || value === null || value === "") continue;
    params.set(field, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  const promotedObject = source?.promoted_object && typeof source.promoted_object === "object"
    ? { ...source.promoted_object, page_id: String(pageId) }
    : { page_id: String(pageId) };
  params.set("promoted_object", JSON.stringify(promotedObject));
  return { params, promotedObject };
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  const token = getMetaToken(env);
  if (!token) return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  const body = await readJson(request);
  const sourceAdsetId = String(body?.source_adset_id || "").trim();
  const campaignId = String(body?.campaign_id || "").trim();
  const pageId = String(body?.page_id || "").trim();
  const name = String(body?.name || "").trim();
  if (!/^\d+$/.test(sourceAdsetId) || !/^\d+$/.test(campaignId) || !/^\d+$/.test(pageId) || !name) {
    return jsonResponse(400, { error: "source_adset_id, campaign_id, page_id e name sao obrigatorios" });
  }

  try {
    const fields = ["id", "name", "account_id", ...COPY_FIELDS].join(",");
    const sourceResponse = await fetch(
      `${API_BASE}/${encodeURIComponent(sourceAdsetId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`,
      { cache: "no-store" }
    );
    const source = await safeJson(sourceResponse);
    if (!sourceResponse.ok) {
      return jsonResponse(sourceResponse.status, { error: "Erro Meta", details: source, stage: "read-source-adset" });
    }
    const accountId = String(source?.account_id || "").replace(/^act_/i, "");
    if (!/^\d+$/.test(accountId)) {
      return jsonResponse(400, { error: "A Meta nao devolveu a conta do conjunto modelo." });
    }
    const modeled = buildModeledAdsetParams(source, {
      campaignId,
      pageId,
      name,
      status: body?.status,
    });
    modeled.params.set("access_token", token);
    const createResponse = await fetch(`${API_BASE}/act_${encodeURIComponent(accountId)}/adsets`, {
      method: "POST",
      body: modeled.params,
    });
    const data = await safeJson(createResponse);
    if (!createResponse.ok) {
      return jsonResponse(createResponse.status, {
        error: "Erro Meta",
        details: data,
        stage: "create-modeled-adset",
      });
    }
    return jsonResponse(200, {
      code: "success",
      adset_id: data?.id || null,
      promoted_object: modeled.promotedObject,
      data,
    });
  } catch (error) {
    return jsonResponse(500, { error: "Erro ao criar conjunto com a nova Pagina", details: error?.message || String(error) });
  }
}
