import { jsonResponse, getJoinadsToken, safeJson } from "../_utils.js";
import { loadSettings, normalizeDomain } from "../_settings.js";
import { refreshJoinadsDailyCache, validateJoinadsDomainPayload } from "../_joinads-cache.js";

const API_BASE = "https://office.joinads.me/api/clients-endpoints";
const TIME_ZONE = "America/Sao_Paulo";
const SUPER_KEYS = ["utm_content", "utm_campaign", "utm_term", "utm_source", "utm_medium"];
const DEFAULT_DISABLED_DOMAINS = ["br.remediototal.com.br", "intre.remediototal.com.br"];

function saoPauloDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function previousDay(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

async function joinadsRequest(token, path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await safeJson(response);
  if (!response.ok || data?.code === "error" || !Array.isArray(data?.data)) {
    const error = new Error(`JoinAds ${path} falhou (${response.status})`);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

async function recordRun(env, run) {
  const db = env.DASHBOARD_DB || null;
  if (!db) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS joinads_finalize_runs (
    id TEXT PRIMARY KEY, report_date TEXT NOT NULL, started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL, status TEXT NOT NULL, domains_count INTEGER NOT NULL,
    reports_ok INTEGER NOT NULL, reports_failed INTEGER NOT NULL, details TEXT NOT NULL
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_joinads_finalize_runs_date ON joinads_finalize_runs(report_date, finished_at)").run();
  await db.prepare(`INSERT INTO joinads_finalize_runs
    (id, report_date, started_at, finished_at, status, domains_count, reports_ok, reports_failed, details)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
    .bind(crypto.randomUUID(), run.reportDate, run.startedAt, run.finishedAt, run.status,
      run.domainsCount, run.reportsOk, run.reportsFailed, JSON.stringify(run.details)).run();
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  const configuredSecret = String(env.JOINADS_CRON_SECRET || env.CPA_CRON_SECRET || "");
  const incomingSecret = String(request.headers.get("x-cron-secret") || "");
  if (!configuredSecret) return jsonResponse(503, { error: "JOINADS_CRON_SECRET ou CPA_CRON_SECRET nao configurado" });
  if (incomingSecret !== configuredSecret) return jsonResponse(401, { error: "Unauthorized" });
  if (!env.DASHBOARD_DB && !env.DASHBOARD_KV && !env.CPA_RULES_KV) {
    return jsonResponse(503, { error: "Banco/KV para cache diario nao configurado" });
  }
  const token = getJoinadsToken(env);
  if (!token) return jsonResponse(500, { error: "JOINADS_ACCESS_TOKEN nao configurado" });

  const startedAt = new Date().toISOString();
  const requestedDay = new URL(request.url).searchParams.get("date");
  const reportDate = /^\d{4}-\d{2}-\d{2}$/.test(String(requestedDay || ""))
    ? requestedDay
    : previousDay(saoPauloDate());
  const strict = new URL(request.url).searchParams.get("strict") === "1";
  const settings = await loadSettings(env);
  const domains = Array.from(new Set((settings.domains || []).map(normalizeDomain).filter(Boolean)));
  const disabledDomains = new Set(
    String(env.JOINADS_FINALIZE_DISABLED_DOMAINS ?? DEFAULT_DISABLED_DOMAINS.join(","))
      .split(",")
      .map(normalizeDomain)
      .filter(Boolean)
  );
  const candidateDomains = domains.filter((domain) => !disabledDomains.has(domain));
  const results = domains
    .filter((domain) => disabledDomains.has(domain))
    .map((domain) => ({
      name: `domain:${domain}`,
      ok: true,
      skipped: true,
      reason: "disabled_until_joinads_accepts_domain",
    }));

  const runJob = async (job) => {
    try {
      const summary = await refreshJoinadsDailyCache({
        env,
        reportName: job.reportName,
        day: reportDate,
        identity: job.identity,
        fetchDay: job.fetchDay,
        validatePayload: job.validatePayload,
      });
      return { name: job.name, ok: true, critical: job.critical !== false, ...summary };
    } catch (error) {
      return {
        name: job.name,
        ok: false,
        critical: job.critical !== false,
        error: error.message,
        code: error.code || null,
        status: error.status || null,
      };
    }
  };

  results.push(await runJob({
    name: "earnings:all",
    reportName: "earnings",
    identity: { domain: "__all__" },
    fetchDay: (day) => {
      const query = new URLSearchParams({ start_date: day, end_date: day });
      return joinadsRequest(token, `/earnings?${query.toString()}`);
    },
  }));

  const domainChecks = await Promise.all(candidateDomains.map((domain) => runJob({
    name: `earnings:${domain}`,
    reportName: "earnings",
    identity: { domain },
    fetchDay: (day) => {
      const query = new URLSearchParams({ start_date: day, end_date: day, domain });
      return joinadsRequest(token, `/earnings?${query.toString()}`);
    },
    validatePayload: (payload) => validateJoinadsDomainPayload(payload, domain),
  })));
  results.push(...domainChecks);
  const activeDomains = domainChecks
    .filter((item) => item.ok)
    .map((item) => item.name.slice("earnings:".length));

  const jobs = [];
  const addJob = (name, reportName, identity, fetchDay, validatePayload) => {
    jobs.push({ name, reportName, identity, fetchDay, validatePayload });
  };

  activeDomains.forEach((domain) => {
    const validateDomain = (payload) => validateJoinadsDomainPayload(payload, domain);
    SUPER_KEYS.forEach((customKey) => {
      const payload = {
        start_date: reportDate, end_date: reportDate, "domain[]": [domain],
        custom_key: customKey, group: ["domain", "custom_value"],
      };
      addJob(
        `super-filter:${domain}:${customKey}`,
        "super-filter",
        payload,
        (day) => joinadsRequest(token, "/super-filter", {
          method: "POST", body: JSON.stringify({ ...payload, start_date: day, end_date: day }),
        }),
        validateDomain
      );
    });
    const countryIdentity = { domain, report_type: "Analytical", custom_key: "utm_campaign" };
    addJob(`key-value-country:${domain}`, "key-value-country", countryIdentity, (day) => {
      const query = new URLSearchParams({ start_date: day, end_date: day, ...countryIdentity });
      return joinadsRequest(token, `/key-value-country?${query.toString()}`);
    }, validateDomain);
    const topIdentity = { domains: [domain], limit: "500", sort: "revenue" };
    addJob(`top-url:${domain}`, "top-url", topIdentity, (day) => {
      const query = new URLSearchParams({ start_date: day, end_date: day, limit: "500", sort: "revenue" });
      query.append("domain[]", domain);
      return joinadsRequest(token, `/top-url?${query.toString()}`);
    }, validateDomain);
  });

  const jobResults = new Array(jobs.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      const index = cursor++;
      jobResults[index] = await runJob(jobs[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, worker));
  results.push(...jobResults);
  const failed = results.filter((item) => !item.ok);
  const criticalFailed = failed.filter((item) => item.critical !== false);
  const run = {
    reportDate, startedAt, finishedAt: new Date().toISOString(),
    status: criticalFailed.length ? "partial" : "success",
    strict,
    domainsCount: domains.length,
    activeDomains,
    disabledDomains: Array.from(disabledDomains).filter((domain) => domains.includes(domain)),
    reportsOk: results.length - failed.length,
    reportsFailed: failed.length,
    details: results,
  };
  try { await recordRun(env, run); } catch (error) { run.auditError = error.message; }
  return jsonResponse(strict && criticalFailed.length ? 502 : 200, { code: run.status, ...run });
}
