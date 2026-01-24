const API_BASE = "https://graph.facebook.com/v24.0";

module.exports = async function handler(req, res) {
  const token = process.env.META_ACCESS_TOKEN || process.env.META_TOKEN;
  if (!token) {
    res.status(500).json({ error: "META_ACCESS_TOKEN nao configurado" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

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

  try {
    const params = new URLSearchParams();
    params.set("daily_budget", String(Math.round(budgetNumber * 100)));
    params.set("access_token", token);

    const response = await fetch(`${API_BASE}/${encodeURIComponent(adset_id)}`, {
      method: "POST",
      body: params,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      res.status(response.status).json({ error: "Erro Meta", details: data });
      return;
    }
    res.status(200).json({ code: "success", data });
  } catch (error) {
    res.status(500).json({ error: "Erro ao atualizar conjunto", details: error.message });
  }
};
