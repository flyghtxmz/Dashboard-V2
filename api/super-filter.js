const API_BASE = "https://office.joinads.me/api/clients-endpoints";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.JOINADS_ACCESS_TOKEN;
  if (!token) {
    res.status(500).json({ error: "JOINADS_ACCESS_TOKEN não configurado" });
    return;
  }

  const body =
    typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : req.body || {};

  const { start_date, end_date } = body;
  const missing = [];
  if (!start_date) missing.push("start_date");
  if (!end_date) missing.push("end_date");

  if (missing.length) {
    res
      .status(400)
      .json({ error: `Parâmetros obrigatórios: ${missing.join(", ")}` });
    return;
  }

  const payload = { ...body };
  if (payload.domain && !Array.isArray(payload.domain)) {
    payload.domain = [payload.domain];
  }
  if (!payload.group) {
    payload.group = [];
  }

  try {
    const response = await fetch(`${API_BASE}/super-filter`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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
