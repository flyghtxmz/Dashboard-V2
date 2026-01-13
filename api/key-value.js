const API_BASE = "https://office.joinads.me/api/clients-endpoints";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.JOINADS_ACCESS_TOKEN;
  if (!token) {
    res.status(500).json({ error: "JOINADS_ACCESS_TOKEN não configurado" });
    return;
  }

  const { start_date, end_date, domain, report_type, custom_key, custom_value } =
    req.query || {};

  const missing = [];
  if (!start_date) missing.push("start_date");
  if (!end_date) missing.push("end_date");
  if (!domain) missing.push("domain");
  if (!report_type) missing.push("report_type");
  if (!custom_key) missing.push("custom_key");

  if (missing.length) {
    res
      .status(400)
      .json({ error: `Parâmetros obrigatórios: ${missing.join(", ")}` });
    return;
  }

  const params = new URLSearchParams();
  params.set("start_date", start_date);
  params.set("end_date", end_date);
  if (Array.isArray(domain)) {
    domain.forEach((d) => params.append("domain", d));
  } else {
    params.set("domain", domain);
  }
  params.set("report_type", report_type);
  params.set("custom_key", custom_key);
  if (custom_value) {
    params.set("custom_value", custom_value);
  }

  try {
    const response = await fetch(`${API_BASE}/key-value?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      res.status(response.status).json({ error: "Erro JoinAds", details: data });
      return;
    }

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao consultar JoinAds",
      details: error.message,
    });
  }
};
