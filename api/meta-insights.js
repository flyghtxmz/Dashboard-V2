const API_BASE = "https://graph.facebook.com/v24.0";

module.exports = async function handler(req, res) {
  const token = process.env.META_ACCESS_TOKEN || process.env.META_TOKEN;
  if (!token) {
    res.status(500).json({ error: "META_ACCESS_TOKEN não configurado" });
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { account_id, start_date, end_date } = req.query || {};
  const missing = [];
  if (!account_id) missing.push("account_id");
  if (!start_date) missing.push("start_date");
  if (!end_date) missing.push("end_date");

  if (missing.length) {
    res
      .status(400)
      .json({ error: `Parâmetros obrigatórios: ${missing.join(", ")}` });
    return;
  }

  const params = new URLSearchParams();
  params.set("fields", [
    "date_start",
    "campaign_name",
    "adset_name",
    "ad_name",
    "objective",
    "spend",
    "results",
    "cpm",
    "cost_per_result",
  ].join(","));
  params.set(
    "time_range",
    JSON.stringify({ since: start_date, until: end_date })
  );
  params.set("level", "ad");
  params.set("time_increment", "1");
  params.set("access_token", token);

  try {
    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(account_id)}/insights?${params.toString()}`
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      res.status(response.status).json({ error: "Erro Meta", details: data });
      return;
    }
    res.status(200).json({ code: "success", data: data.data || [] });
  } catch (error) {
    res.status(500).json({ error: "Erro ao consultar Meta", details: error.message });
  }
};
