import { jsonResponse, readJson, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) {
    return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const body = await readJson(request);
  const { adset_id, daily_budget_brl } = body || {};
  if (!adset_id || daily_budget_brl === undefined || daily_budget_brl === null) {
    return jsonResponse(400, {
      error: "Parametros obrigatorios: adset_id, daily_budget_brl",
    });
  }

  const budgetNumber = Number(String(daily_budget_brl).replace(",", "."));
  if (!Number.isFinite(budgetNumber) || budgetNumber <= 0) {
    return jsonResponse(400, { error: "daily_budget_brl invalido" });
  }

  try {
    const params = new URLSearchParams();
    params.set("daily_budget", String(Math.round(budgetNumber * 100)));
    params.set("access_token", token);

    const response = await fetch(`${API_BASE}/${encodeURIComponent(adset_id)}`, {
      method: "POST",
      body: params,
    });
    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, { error: "Erro Meta", details: data });
    }

    let adset = null;
    try {
      const checkRes = await fetch(
        `${API_BASE}/${encodeURIComponent(
          adset_id
        )}?fields=daily_budget,lifetime_budget,budget_remaining&access_token=${token}`
      );
      adset = await safeJson(checkRes);
    } catch (e) {
      adset = null;
    }

    return jsonResponse(200, { code: "success", data, adset });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao atualizar conjunto",
      details: error.message,
    });
  }
}
