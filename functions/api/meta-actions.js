import { jsonResponse, readJson, getQuery, getMetaToken, safeJson } from "../_utils.js";

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) {
    return json(500, { error: "META_ACCESS_TOKEN nao configurado" });
  }

  const method = request.method || "GET";
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const body = method === "GET" ? null : await readJson(request);
  const action = method === "GET"
    ? getQuery(request).get("action")
    : body?.action;

  if (method === "GET") {
    if (action === "adset-ads") {
      const params = getQuery(request);
      const adset_id = params.get("adset_id");
      if (!adset_id) {
        return json(400, { error: "Parametros obrigatorios: adset_id" });
      }
      try {
        const adsUrl = `${API_BASE}/${encodeURIComponent(
          adset_id
        )}/ads?fields=id,name,status,effective_status&limit=200&access_token=${token}`;
        const ads = await fetchAll(adsUrl);
        return json(200, { code: "success", data: ads });
      } catch (error) {
        return json(500, {
          error: "Erro ao consultar ads",
          details: error.details || error.message,
        });
      }
    }

    return json(400, { error: "Acao invalida" });
  }

  if (method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    if (action === "ad-status") {
      const { ad_id, status } = body || {};
      if (!ad_id || !status) {
        return json(400, {
          error: "Parametros obrigatorios: ad_id, status",
        });
      }
      const params = new URLSearchParams();
      params.set("status", status);
      params.set("access_token", token);
      const response = await fetch(`${API_BASE}/${encodeURIComponent(ad_id)}`, {
        method: "POST",
        body: params,
      });
      const data = await safeJson(response);
      if (!response.ok) {
        return json(response.status, { error: "Erro Meta", details: data });
      }
      return json(200, { code: "success", data });
    }

    if (action === "adset-budget") {
      const { adset_id, daily_budget_brl } = body || {};
      if (!adset_id || daily_budget_brl === undefined || daily_budget_brl === null) {
        return json(400, {
          error: "Parametros obrigatorios: adset_id, daily_budget_brl",
        });
      }
      const budgetNumber = Number(String(daily_budget_brl).replace(",", "."));
      if (!Number.isFinite(budgetNumber) || budgetNumber <= 0) {
        return json(400, { error: "daily_budget_brl invalido" });
      }
      const params = new URLSearchParams();
      params.set("daily_budget", String(Math.round(budgetNumber * 100)));
      params.set("access_token", token);
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(adset_id)}`,
        { method: "POST", body: params }
      );
      const data = await safeJson(response);
      if (!response.ok) {
        return json(response.status, { error: "Erro Meta", details: data });
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
      return json(200, { code: "success", data, adset });
    }

    if (action === "adset-copy") {
      const { adset_id, status_option } = body || {};
      if (!adset_id) {
        return json(400, { error: "Parametros obrigatorios: adset_id" });
      }
      const params = new URLSearchParams();
      params.set("deep_copy", "true");
      if (status_option) params.set("status_option", status_option);
      params.set("access_token", token);
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(adset_id)}/copies`,
        { method: "POST", body: params }
      );
      const data = await safeJson(response);
      if (!response.ok) {
        return json(response.status, { error: "Erro Meta", details: data });
      }
      const newId =
        data?.copied_adset_id || data?.id || data?.copied_id || null;
      return json(200, { code: "success", data, new_adset_id: newId });
    }

    if (action === "rename") {
      const { object_id, name } = body || {};
      if (!object_id || !name) {
        return json(400, {
          error: "Parametros obrigatorios: object_id, name",
        });
      }
      const params = new URLSearchParams();
      params.set("name", name);
      params.set("access_token", token);
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(object_id)}`,
        { method: "POST", body: params }
      );
      const data = await safeJson(response);
      if (!response.ok) {
        return json(response.status, { error: "Erro Meta", details: data });
      }
      return json(200, { code: "success", data });
    }

    if (action === "delete-ad") {
      const { ad_id } = body || {};
      if (!ad_id) {
        return json(400, { error: "Parametros obrigatorios: ad_id" });
      }
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(ad_id)}?access_token=${token}`,
        { method: "DELETE" }
      );
      const data = await safeJson(response);
      if (!response.ok) {
        return json(response.status, { error: "Erro Meta", details: data });
      }
      return json(200, { code: "success", data });
    }

    return json(400, { error: "Acao invalida" });
  } catch (error) {
    return json(500, {
      error: "Erro Meta",
      details: error.details || error.message,
    });
  }
}
