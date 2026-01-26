import { jsonResponse, readJson, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";
const CHUNK_SIZE = 50;

async function fetchStatuses(ids, fields, token) {
  const results = {};
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    if (!chunk.length) continue;
    const res = await fetch(
      `${API_BASE}/?ids=${chunk.join(",")}&fields=${fields}&access_token=${token}`
    );
    const json = await safeJson(res);
    if (!res.ok) {
      const err = new Error("Erro Meta");
      err.details = json;
      throw err;
    }
    Object.entries(json || {}).forEach(([id, value]) => {
      if (value && (value.status || value.effective_status)) {
        results[id] = {
          status: value.status,
          effective_status: value.effective_status,
        };
      }
    });
  }
  return results;
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
  const campaign_ids = Array.isArray(body?.campaign_ids) ? body.campaign_ids : [];
  const adset_ids = Array.isArray(body?.adset_ids) ? body.adset_ids : [];
  const ad_ids = Array.isArray(body?.ad_ids) ? body.ad_ids : [];

  try {
    const [campaigns, adsets, ads] = await Promise.all([
      fetchStatuses(campaign_ids, "status,effective_status", token),
      fetchStatuses(adset_ids, "status,effective_status", token),
      fetchStatuses(ad_ids, "status,effective_status", token),
    ]);
    return jsonResponse(200, {
      code: "success",
      campaigns,
      adsets,
      ads,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao atualizar status",
      details: error.details || error.message,
    });
  }
}
