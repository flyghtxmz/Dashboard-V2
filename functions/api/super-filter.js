import {
  jsonResponse,
  getJoinadsToken,
  readJson,
  safeJson,
} from "../_utils.js";
import { getSession, requireDomainAccess } from "../_auth.js";
import { fetchJoinadsDailyCached, hasJoinadsDailyStorage, validateJoinadsDomainPayload } from "../_joinads-cache.js";
import { validateDateRange } from "../_dates.js";

const API_BASE = "https://office.joinads.me/api/clients-endpoints";

export async function onRequest({ request, env }) {
  const session = await getSession(request, env);
  if (!session) {
    return jsonResponse(401, { code: "error", message: "Sessao invalida ou expirada." });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const token = getJoinadsToken(env);
  if (!token) {
    return jsonResponse(500, { error: "JOINADS_ACCESS_TOKEN nao configurado" });
  }

  const body = await readJson(request);
  const { start_date, end_date } = body || {};
  const missing = [];
  if (!start_date) missing.push("start_date");
  if (!end_date) missing.push("end_date");
  if (missing.length) {
    return jsonResponse(400, {
      error: `Parametros obrigatorios: ${missing.join(", ")}`,
    });
  }

  const payload = { ...body };
  if (payload.domain && !Array.isArray(payload.domain)) {
    payload.domain = [payload.domain];
  }
  const dateRange = validateDateRange(start_date, end_date, 15);
  if (!dateRange.ok) return jsonResponse(400, { error: dateRange.error });
  const requestedDomains = Array.isArray(payload["domain[]"])
    ? payload["domain[]"]
    : Array.isArray(payload.domain)
    ? payload.domain
    : payload.domain
    ? [payload.domain]
    : [];
  const access = requireDomainAccess(session, requestedDomains, { allowEmpty: true });
  if (!access.ok) return access.response;
  if (access.domains.length) {
    payload["domain[]"] = access.domains;
    delete payload.domain;
  } else if (session.role !== "admin") {
    payload["domain[]"] = session.allowedDomains || [];
    delete payload.domain;
  }
  if (!payload.group) {
    payload.group = [];
  }

  const logBase = {
    report: "Relatorio de URL Avancado",
    method: "POST",
    endpoint: `${API_BASE}/super-filter`,
    authorization: "Bearer [REDACTED]",
    request: payload,
  };
  console.log("[joinads-super-filter] request", JSON.stringify(logBase));

  try {
    const fetchPayload = async (requestPayload) => {
      const response = await fetch(`${API_BASE}/super-filter`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
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
    };
    let data;
    if (hasJoinadsDailyStorage(env)) {
      const cached = await fetchJoinadsDailyCached({
        env,
        reportName: "super-filter",
        startDate: start_date,
        endDate: end_date,
        identity: payload,
        fetchDay: (day) => fetchPayload({ ...payload, start_date: day, end_date: day }),
        validatePayload: access.domains.length === 1
          ? (result) => validateJoinadsDomainPayload(result, access.domains[0])
          : undefined,
      });
      data = {
        code: "success",
        data: cached.results.flatMap((result) => Array.isArray(result?.data) ? result.data : []),
        cache: cached.diagnostics,
      };
    } else {
      data = await fetchPayload(payload);
    }
    console.log(
      "[joinads-super-filter] response",
      JSON.stringify({
        ...logBase,
        status: 200,
        ok: true,
        code: data?.code || null,
        rows: Array.isArray(data?.data) ? data.data.length : 0,
        customKeys: Array.from(
          new Set((data?.data || []).map((row) => row?.custom_key).filter(Boolean))
        ),
        customValues: (data?.data || [])
          .map((row) => row?.custom_value)
          .filter(Boolean)
          .slice(0, 20),
      })
    );
    return jsonResponse(200, data);
  } catch (error) {
    console.error(
      "[joinads-super-filter] error",
      JSON.stringify({ ...logBase, error: error.message })
    );
    return jsonResponse(500, {
      error: "Erro ao consultar JoinAds",
      details: error.details || error.message,
    });
  }
}
