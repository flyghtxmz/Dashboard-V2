import {
  jsonResponse,
  getQuery,
  getJoinadsToken,
  safeJson,
} from "../_utils.js";

const API_BASE = "https://office.joinads.me/api/clients-endpoints";

export async function onRequest({ request, env }) {
  if (request.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const token = getJoinadsToken(env);
  if (!token) {
    return jsonResponse(500, { error: "JOINADS_ACCESS_TOKEN nao configurado" });
  }

  const params = getQuery(request);
  const start_date = params.get("start_date");
  const end_date = params.get("end_date");
  const domain = params.get("domain");
  const report_type = params.get("report_type");
  const custom_key = params.get("custom_key");
  const custom_value = params.get("custom_value");

  const missing = [];
  if (!start_date) missing.push("start_date");
  if (!end_date) missing.push("end_date");
  if (!domain) missing.push("domain");
  if (!report_type) missing.push("report_type");
  if (!custom_key) missing.push("custom_key");
  if (missing.length) {
    return jsonResponse(400, {
      error: `Parametros obrigatorios: ${missing.join(", ")}`,
    });
  }

  const q = new URLSearchParams();
  q.set("start_date", start_date);
  q.set("end_date", end_date);
  q.set("domain", domain);
  q.set("report_type", report_type);
  q.set("custom_key", custom_key);
  if (custom_value) q.set("custom_value", custom_value);

  try {
    const response = await fetch(`${API_BASE}/key-value?${q.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, { error: "Erro JoinAds", details: data });
    }

    return jsonResponse(200, data);
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao consultar JoinAds",
      details: error.message,
    });
  }
}
