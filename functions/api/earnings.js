import {
  jsonResponse,
  getQuery,
  getJoinadsToken,
  readJson,
  safeJson,
} from "../_utils.js";
import { getSession, requireDomainAccess } from "../_auth.js";
import { fetchJoinadsDailyCached, hasJoinadsDailyStorage, validateJoinadsDomainPayload } from "../_joinads-cache.js";
import { validateDateRange } from "../_dates.js";

const API_BASE = "https://office.joinads.me/api/clients-endpoints";

async function fetchEarnings(token, start_date, end_date, domain) {
  const params = new URLSearchParams();
  params.set("start_date", start_date);
  params.set("end_date", end_date);
  if (domain) params.set("domain", domain);

  const response = await fetch(`${API_BASE}/earnings?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const data = await safeJson(response);
  if (!response.ok) {
    const error = new Error("Erro JoinAds");
    error.status = response.status;
    error.details = data;
    throw error;
  }
  if (data?.code === "error" || !Array.isArray(data?.data)) {
    const error = new Error("Resposta invalida da JoinAds"); error.status = 502; error.details = data; throw error;
  }
  return data;
}

async function fetchEarningsCached(env, token, startDate, endDate, domain) {
  if (!hasJoinadsDailyStorage(env)) return fetchEarnings(token, startDate, endDate, domain);
  const cached = await fetchJoinadsDailyCached({
    env, reportName: "earnings", startDate, endDate,
    identity: { domain: domain || "__all__" },
    fetchDay: (day) => fetchEarnings(token, day, day, domain),
    validatePayload: domain ? (payload) => validateJoinadsDomainPayload(payload, domain) : undefined,
  });
  return {
    code: "success",
    data: cached.results.flatMap((result) => Array.isArray(result?.data) ? result.data : []),
    cache: cached.diagnostics,
  };
}

export async function onRequest({ request, env }) {
  const session = await getSession(request, env);
  if (!session) {
    return jsonResponse(401, { code: "error", message: "Sessao invalida ou expirada." });
  }

  const token = getJoinadsToken(env);
  if (!token) {
    return jsonResponse(500, { error: "JOINADS_ACCESS_TOKEN nao configurado" });
  }

  const method = request.method || "GET";
  if (method !== "GET" && method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed, use GET or POST" });
  }

  const query = getQuery(request);
  const body = method === "POST" ? await readJson(request) : {};

  const start_date = method === "GET" ? query.get("start_date") : body.start_date;
  const end_date = method === "GET" ? query.get("end_date") : body.end_date;
  const domain = method === "GET" ? query.get("domain") : body.domain;

  const missing = [];
  if (!start_date) missing.push("start_date");
  if (!end_date) missing.push("end_date");
  if (missing.length) {
    return jsonResponse(400, {
      error: `Parametros obrigatorios: ${missing.join(", ")}`,
    });
  }

  const dateRange = validateDateRange(start_date, end_date, 15);
  if (!dateRange.ok) return jsonResponse(400, { error: dateRange.error });

  try {
    if (domain) {
      const access = requireDomainAccess(session, domain);
      if (!access.ok) return access.response;
      const data = await fetchEarningsCached(env, token, start_date, end_date, access.domains[0]);
      return jsonResponse(200, data);
    }

    if (session.role !== "admin") {
      const allowedDomains = Array.isArray(session.allowedDomains) ? session.allowedDomains : [];
      const results = await Promise.all(
        allowedDomains.map((item) => fetchEarningsCached(env, token, start_date, end_date, item))
      );
      const data = results.flatMap((item) => (Array.isArray(item?.data) ? item.data : []));
      return jsonResponse(200, { data });
    }

    const data = await fetchEarningsCached(env, token, start_date, end_date, null);
    return jsonResponse(200, data);
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao consultar JoinAds",
      details: error.details || error.message,
    });
  }
}
