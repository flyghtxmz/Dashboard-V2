import { jsonResponse, getJoinadsToken, readJson, safeJson } from "../_utils.js";
import { getSession, requireDomainAccess } from "../_auth.js";

const ENDPOINT = "https://office.joinads.me/api/clients-endpoints/report/advertiser/campaign";
const MAX_CAMPAIGNS = 100;
const CONCURRENCY = 5;

function clean(value) {
  return String(value || "").trim();
}

async function queryCampaign(token, baseParams, campaign) {
  const params = new URLSearchParams({ ...baseParams, utm_campaign: campaign });
  const response = await fetch(`${ENDPOINT}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const data = await safeJson(response);
  if (!response.ok) {
    return {
      campaign,
      ok: false,
      status: response.status,
      tokenInvalid: response.status === 401 || response.status === 403,
      error: data?.message || data?.error || `Erro JoinAds (${response.status})`,
      details: data,
      rows: [],
    };
  }
  return { campaign, ok: true, status: response.status, rows: Array.isArray(data?.data) ? data.data : [] };
}

export async function onRequest({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return jsonResponse(401, { error: "Sessao invalida ou expirada." });
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  const token = getJoinadsToken(env);
  if (!token) return jsonResponse(500, { error: "JOINADS_ACCESS_TOKEN nao configurado", tokenInvalid: true });

  const body = await readJson(request);
  const domain = clean(body?.domain);
  const access = requireDomainAccess(session, domain);
  if (!access.ok) return access.response;
  const startDate = clean(body?.start_date);
  const endDate = clean(body?.end_date);
  if (!startDate || !endDate) return jsonResponse(400, { error: "Parametros obrigatorios: start_date, end_date" });

  const requested = Array.from(new Set((Array.isArray(body?.utm_campaigns) ? body.utm_campaigns : [])
    .map(clean).filter(Boolean)));
  const campaigns = requested.slice(0, MAX_CAMPAIGNS);
  const results = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < campaigns.length) {
      const index = cursor++;
      results[index] = await queryCampaign(token, {
        start_date: startDate,
        end_date: endDate,
        domain: access.domains[0],
      }, campaigns[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, campaigns.length) }, worker));
  const rows = results.flatMap((result) => result.rows.map((row) => ({ ...row, _requested_utm_campaign: result.campaign })));
  const failures = results.filter((result) => !result.ok).map(({ rows: _rows, details, ...result }) => ({ ...result, details }));
  return jsonResponse(200, {
    code: "success",
    data: rows,
    diagnostics: {
      endpoint: ENDPOINT,
      requested: requested.length,
      queried: campaigns.length,
      truncated: requested.length > campaigns.length,
      rows: rows.length,
      failures,
      tokenInvalid: failures.some((item) => item.tokenInvalid),
    },
  });
}
