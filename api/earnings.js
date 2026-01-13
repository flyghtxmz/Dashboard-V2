const API_BASE = "https://office.joinads.me/api/clients-endpoints";

module.exports = async function handler(req, res) {
  const token = process.env.JOINADS_ACCESS_TOKEN;
  if (!token) {
    res.status(500).json({ error: "JOINADS_ACCESS_TOKEN não configurado" });
    return;
  }

  // Aceita GET ou POST, mas sempre chama a JoinAds via GET (documentação retornou que POST não é aceito).
  const fromQuery = req.query || {};
  const fromBody =
    typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : req.body || {};

  const { start_date, end_date, domain } =
    req.method === "GET" ? fromQuery : fromBody;

  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed, use GET or POST" });
    return;
  }

  const missing = [];
  if (!start_date) missing.push("start_date");
  if (!end_date) missing.push("end_date");

  if (missing.length) {
    res
      .status(400)
      .json({ error: `Parâmetros obrigatórios: ${missing.join(", ")}` });
    return;
  }

  const params = new URLSearchParams();
  params.set("start_date", start_date);
  params.set("end_date", end_date);
  if (domain) params.set("domain", domain);

  try {
    const response = await fetch(`${API_BASE}/earnings?${params.toString()}`, {
      method: "GET",
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
