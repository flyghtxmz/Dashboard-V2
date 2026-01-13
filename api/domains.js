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

  const { start_date, end_date } = req.query || {};
  const missing = [];
  if (!start_date) missing.push("start_date");
  if (!end_date) missing.push("end_date");

  if (missing.length) {
    res
      .status(400)
      .json({ error: `Parâmetros obrigatórios: ${missing.join(", ")}` });
    return;
  }

  const payload = {
    start_date,
    end_date,
    group: ["domain"],
  };

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

    const domains = (data?.data || [])
      .map((row) => row.domain)
      .filter(Boolean)
      .filter((domain, index, arr) => arr.indexOf(domain) === index);

    res.status(200).json({ code: "success", data: domains });
  } catch (error) {
    res.status(500).json({
      error: "Erro ao consultar JoinAds",
      details: error.message,
    });
  }
};
