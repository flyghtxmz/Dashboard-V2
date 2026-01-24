const API_BASE = "https://graph.facebook.com/v24.0";

async function fetchAll(url) {
  const results = [];
  let next = url;
  while (next) {
    const res = await fetch(next);
    const json = await res.json().catch(() => ({}));
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

module.exports = async function handler(req, res) {
  const token = process.env.META_ACCESS_TOKEN || process.env.META_TOKEN;
  if (!token) {
    res.status(500).json({ error: "META_ACCESS_TOKEN nao configurado" });
    return;
  }

  const method = req.method || "GET";
  const action =
    (method === "GET" ? req.query?.action : req.body?.action) || "";

  if (method === "GET") {
    if (action === "adset-ads") {
      const { adset_id } = req.query || {};
      if (!adset_id) {
        res
          .status(400)
          .json({ error: "Parametros obrigatorios: adset_id" });
        return;
      }
      try {
        const adsUrl = `${API_BASE}/${encodeURIComponent(
          adset_id
        )}/ads?fields=id,name,status,effective_status&limit=200&access_token=${token}`;
        const ads = await fetchAll(adsUrl);
        res.status(200).json({ code: "success", data: ads });
      } catch (error) {
        res.status(500).json({
          error: "Erro ao consultar ads",
          details: error.details || error.message,
        });
      }
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    if (action === "ad-status") {
      const { ad_id, status } = req.body || {};
      if (!ad_id || !status) {
        res
          .status(400)
          .json({ error: "Parametros obrigatorios: ad_id, status" });
        return;
      }
      const params = new URLSearchParams();
      params.set("status", status);
      params.set("access_token", token);
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(ad_id)}`,
        {
          method: "POST",
          body: params,
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        res.status(response.status).json({ error: "Erro Meta", details: data });
        return;
      }
      res.status(200).json({ code: "success", data });
      return;
    }

    if (action === "adset-budget") {
      const { adset_id, daily_budget_brl } = req.body || {};
      if (!adset_id || daily_budget_brl === undefined || daily_budget_brl === null) {
        res
          .status(400)
          .json({ error: "Parametros obrigatorios: adset_id, daily_budget_brl" });
        return;
      }
      const budgetNumber = Number(String(daily_budget_brl).replace(",", "."));
      if (!Number.isFinite(budgetNumber) || budgetNumber <= 0) {
        res.status(400).json({ error: "daily_budget_brl invalido" });
        return;
      }
      const params = new URLSearchParams();
      params.set("daily_budget", String(Math.round(budgetNumber * 100)));
      params.set("access_token", token);
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(adset_id)}`,
        { method: "POST", body: params }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        res.status(response.status).json({ error: "Erro Meta", details: data });
        return;
      }
      let adset = null;
      try {
        const checkRes = await fetch(
          `${API_BASE}/${encodeURIComponent(
            adset_id
          )}?fields=daily_budget,lifetime_budget,budget_remaining&access_token=${token}`
        );
        adset = await checkRes.json().catch(() => null);
      } catch (e) {
        adset = null;
      }
      res.status(200).json({ code: "success", data, adset });
      return;
    }

    if (action === "adset-copy") {
      const { adset_id, status_option } = req.body || {};
      if (!adset_id) {
        res.status(400).json({ error: "Parametros obrigatorios: adset_id" });
        return;
      }
      const params = new URLSearchParams();
      params.set("deep_copy", "true");
      if (status_option) params.set("status_option", status_option);
      params.set("access_token", token);
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(adset_id)}/copies`,
        { method: "POST", body: params }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        res.status(response.status).json({ error: "Erro Meta", details: data });
        return;
      }
      const newId =
        data?.copied_adset_id || data?.id || data?.copied_id || null;
      res.status(200).json({ code: "success", data, new_adset_id: newId });
      return;
    }

    if (action === "rename") {
      const { object_id, name } = req.body || {};
      if (!object_id || !name) {
        res
          .status(400)
          .json({ error: "Parametros obrigatorios: object_id, name" });
        return;
      }
      const params = new URLSearchParams();
      params.set("name", name);
      params.set("access_token", token);
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(object_id)}`,
        { method: "POST", body: params }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        res.status(response.status).json({ error: "Erro Meta", details: data });
        return;
      }
      res.status(200).json({ code: "success", data });
      return;
    }

    if (action === "delete-ad") {
      const { ad_id } = req.body || {};
      if (!ad_id) {
        res.status(400).json({ error: "Parametros obrigatorios: ad_id" });
        return;
      }
      const response = await fetch(
        `${API_BASE}/${encodeURIComponent(ad_id)}?access_token=${token}`,
        { method: "DELETE" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        res.status(response.status).json({ error: "Erro Meta", details: data });
        return;
      }
      res.status(200).json({ code: "success", data });
      return;
    }

    res.status(400).json({ error: "Acao invalida" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Erro Meta", details: error.details || error.message });
  }
};
