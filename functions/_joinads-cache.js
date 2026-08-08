const TIME_ZONE = "America/Sao_Paulo";
const DEFAULT_FINAL_HOUR = 10;
const CACHE_SCHEMA = "joinads-daily-v2";
const inFlight = new Map();

function isRetryableJoinadsError(error) {
  const status = Number(error?.status || error?.cause?.status || 0);
  return !status || status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function retryJoinadsFetch(fetcher, { attempts = 3, baseDelayMs = 250 } = {}) {
  let lastError;
  const totalAttempts = Math.max(1, Number(attempts) || 1);
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      return await fetcher(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= totalAttempts || !isRetryableJoinadsError(error)) throw error;
      const delay = Math.max(0, Number(baseDelayMs) || 0) * (2 ** (attempt - 1));
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

function getStorage(env) {
  return {
    db: env.DASHBOARD_DB || null,
    kv: env.DASHBOARD_KV || env.CPA_RULES_KV || null,
  };
}

function localParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23",
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return { iso: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function shiftDay(iso, amount) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function listDays(start, end) {
  const days = [];
  for (let day = start; day <= end; day = shiftDay(day, 1)) days.push(day);
  return days;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.keys(value).sort().reduce((out, key) => {
    if (key !== "start_date" && key !== "end_date" && key !== "_ts") out[key] = stable(value[key]);
    return out;
  }, {});
  return value;
}

async function hashKey(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(stable(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function ensureSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS joinads_daily_cache (
    cache_key TEXT PRIMARY KEY, report_name TEXT NOT NULL, report_date TEXT NOT NULL,
    payload TEXT NOT NULL, finalized_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_joinads_daily_report_date ON joinads_daily_cache(report_name, report_date)").run();
}

async function readStored(storage, key) {
  if (storage.db) {
    const row = await storage.db.prepare("SELECT payload FROM joinads_daily_cache WHERE cache_key = ?1").bind(key).first();
    return row?.payload ? JSON.parse(row.payload) : null;
  }
  return storage.kv ? storage.kv.get(`joinads-daily:${key}`, "json") : null;
}

async function deleteStored(storage, key) {
  if (storage.db) await storage.db.prepare("DELETE FROM joinads_daily_cache WHERE cache_key = ?1").bind(key).run();
  else if (storage.kv) await storage.kv.delete(`joinads-daily:${key}`);
}

function summarizePayload(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return {
    rowCount: rows.length,
    totals: rows.reduce((acc, row) => {
      acc.impressions += Number(row?.impressions ?? row?.AD_EXCHANGE_LINE_ITEM_LEVEL_IMPRESSIONS ?? 0) || 0;
      acc.clicks += Number(row?.clicks ?? row?.AD_EXCHANGE_LINE_ITEM_LEVEL_CLICKS ?? 0) || 0;
      acc.revenue += Number(row?.revenue_client ?? row?.earnings_client ?? row?.revenue ?? row?.earnings ?? row?.AD_EXCHANGE_LINE_ITEM_LEVEL_REVENUE ?? 0) || 0;
      return acc;
    }, { impressions: 0, clicks: 0, revenue: 0 }),
  };
}

function normalizeReportDomain(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").split(/[/:?#]/)[0].replace(/^www\./, "");
  }
}

function rowReportDomain(row) {
  const explicit = row?.domain ?? row?.DOMAIN ?? row?.name ?? row?.NAME;
  if (explicit) return normalizeReportDomain(explicit);
  const url = row?.url ?? row?.URL;
  return url ? normalizeReportDomain(url) : "";
}

export function validateJoinadsDomainPayload(payload, domain) {
  if (!payload || payload.code === "error" || !Array.isArray(payload.data)) return false;
  if (!payload.data.length) return true;
  const expected = normalizeReportDomain(domain);
  if (!expected) return false;
  return payload.data.every((row) => rowReportDomain(row) === expected);
}

function isValidPayload(payload, validatePayload, day) {
  return validatePayload
    ? !!payload && validatePayload(payload, day)
    : !!payload && payload.code !== "error" && Array.isArray(payload.data);
}

async function writeStored(storage, key, reportName, day, payload, { provisional = false } = {}) {
  const now = new Date().toISOString();
  const summary = summarizePayload(payload);
  const envelope = {
    schema: CACHE_SCHEMA,
    reportName,
    reportDate: day,
    savedAt: now,
    provisional,
    rowCount: summary.rowCount,
    totals: summary.totals,
    payload,
  };
  if (storage.db) {
    await storage.db.prepare(`INSERT INTO joinads_daily_cache
      (cache_key, report_name, report_date, payload, finalized_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?5)
      ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, finalized_at=excluded.finalized_at, updated_at=excluded.updated_at`)
      .bind(key, reportName, day, JSON.stringify(envelope), now).run();
  } else if (storage.kv) {
    await storage.kv.put(`joinads-daily:${key}`, JSON.stringify(envelope));
  }
}

export function hasJoinadsDailyStorage(env) {
  const storage = getStorage(env);
  return !!(storage.db || storage.kv);
}

export async function refreshJoinadsDailyCache({ env, reportName, day, identity, fetchDay, validatePayload }) {
  const storage = getStorage(env);
  if (!storage.db && !storage.kv) throw new Error("JOINADS_DAILY_STORAGE_NOT_CONFIGURED");
  if (storage.db) await ensureSchema(storage.db);
  const key = await hashKey({ schema: CACHE_SCHEMA, reportName, day, identity });
  const storedEnvelope = await readStored(storage, key);
  const payload = await fetchDay(day);
  const valid = isValidPayload(payload, validatePayload, day);
  if (!valid) {
    const error = new Error(`Resposta invalida da JoinAds para ${reportName} em ${day}`);
    error.code = "INVALID_JOINADS_PAYLOAD";
    error.payload = payload;
    throw error;
  }
  const nextSummary = summarizePayload(payload);
  const storedRevenue = Number(storedEnvelope?.totals?.revenue || 0);
  if (storedRevenue > 0 && nextSummary.totals.revenue <= 0) {
    const error = new Error(`JoinAds retornou receita zero para ${reportName} em ${day}; cache positivo preservado`);
    error.code = "SUSPICIOUS_ZERO_AFTER_POSITIVE";
    throw error;
  }
  await writeStored(storage, key, reportName, day, payload, { provisional: false });
  return { reportName, day, ...nextSummary, finalized: true };
}

export async function fetchJoinadsDailyCached({ env, reportName, startDate, endDate, identity, fetchDay, validatePayload }) {
  const storage = getStorage(env);
  if (!storage.db && !storage.kv) throw new Error("JOINADS_DAILY_STORAGE_NOT_CONFIGURED");
  if (storage.db) await ensureSchema(storage.db);
  const nowLocal = localParts();
  const yesterday = shiftDay(nowLocal.iso, -1);
  const finalHour = Math.min(23, Math.max(0, Number(env.REPORT_YESTERDAY_FINAL_HOUR ?? DEFAULT_FINAL_HOUR)));
  const days = listDays(startDate, endDate);
  const results = new Array(days.length);
  let cursor = 0;
  const hits = [];
  const apiDays = [];
  const provisionalDays = [];
  const fallbackDays = [];
  const dayAudit = [];
  const worker = async () => {
    while (cursor < days.length) {
      const index = cursor++;
      const day = days[index];
      const liveToday = day >= nowLocal.iso;
      const provisionalYesterday = day === yesterday && nowLocal.hour < finalHour;
      const finalizable = day < yesterday || (day === yesterday && nowLocal.hour >= finalHour);
      const key = await hashKey({ schema: CACHE_SCHEMA, reportName, day, identity });
      let storedEnvelope = await readStored(storage, key);
      let envelope = finalizable && storedEnvelope?.provisional !== true ? storedEnvelope : null;
      if (storedEnvelope && (
        storedEnvelope.schema !== CACHE_SCHEMA ||
        storedEnvelope.reportName !== reportName ||
        storedEnvelope.reportDate !== day ||
        !storedEnvelope.payload ||
        !isValidPayload(storedEnvelope.payload, validatePayload, day)
      )) {
        await deleteStored(storage, key);
        storedEnvelope = null;
        envelope = null;
      }
      let payload = envelope?.payload || null;
      if (payload) {
        hits.push(day);
        dayAudit.push({ day, origin: "database", rowCount: envelope.rowCount, totals: envelope.totals, savedAt: envelope.savedAt });
      } else {
        let pending = inFlight.get(key);
        if (!pending) {
          pending = Promise.resolve()
            .then(() => retryJoinadsFetch(() => fetchDay(day)))
            .finally(() => inFlight.delete(key));
          inFlight.set(key, pending);
        }
        let liveError = null;
        try {
          payload = await pending;
        } catch (error) {
          liveError = error;
          payload = null;
        }
        const valid = isValidPayload(payload, validatePayload, day);
        const liveSummary = valid ? summarizePayload(payload) : null;
        const storedRevenue = Number(storedEnvelope?.totals?.revenue || 0);
        const suspiciousEmptyRevenue = valid && liveSummary.totals.revenue <= 0 && storedRevenue > 0;
        const canUseSameDayFallback = !!storedEnvelope?.payload && (suspiciousEmptyRevenue || !valid);
        if (canUseSameDayFallback) {
          payload = storedEnvelope.payload;
          fallbackDays.push(day);
          provisionalDays.push(day);
          dayAudit.push({
            day,
            origin: "database_same_day_fallback",
            reason: liveError ? "api_error" : "api_zero_after_positive",
            rowCount: storedEnvelope.rowCount,
            totals: storedEnvelope.totals,
            savedAt: storedEnvelope.savedAt,
          });
        } else if (!valid) {
          const error = new Error(`Resposta invalida da JoinAds para ${reportName} em ${day}`);
          error.code = "INVALID_JOINADS_PAYLOAD";
          error.payload = payload;
          error.cause = liveError;
          throw error;
        } else {
          apiDays.push(day);
          if (provisionalYesterday) provisionalDays.push(day);
          await writeStored(storage, key, reportName, day, payload, { provisional: !finalizable });
          dayAudit.push({ day, origin: "api", rowCount: liveSummary.rowCount, totals: liveSummary.totals, savedAt: new Date().toISOString() });
        }
      }
      results[index] = payload;
      if (liveToday) provisionalDays.push(day);
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, days.length) }, worker));
  return {
    results,
    diagnostics: {
      reportName, startDate, endDate, finalHour, timeZone: TIME_ZONE,
      cacheSchema: CACHE_SCHEMA,
      cacheHitDays: hits.sort(), apiDays: apiDays.sort(),
      sameDayFallbackDays: Array.from(new Set(fallbackDays)).sort(),
      provisionalDays: Array.from(new Set(provisionalDays)).sort(),
      dayAudit: dayAudit.sort((a, b) => a.day.localeCompare(b.day)),
    },
  };
}
