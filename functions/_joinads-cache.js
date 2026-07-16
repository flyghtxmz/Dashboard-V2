const TIME_ZONE = "America/Sao_Paulo";
const DEFAULT_FINAL_HOUR = 10;

function getStorage(env) {
  return {
    db: env.DASHBOARD_DB || env.DB || null,
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

async function writeStored(storage, key, reportName, day, payload) {
  const now = new Date().toISOString();
  if (storage.db) {
    await storage.db.prepare(`INSERT INTO joinads_daily_cache
      (cache_key, report_name, report_date, payload, finalized_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?5)
      ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, finalized_at=excluded.finalized_at, updated_at=excluded.updated_at`)
      .bind(key, reportName, day, JSON.stringify(payload), now).run();
  } else if (storage.kv) {
    await storage.kv.put(`joinads-daily:${key}`, JSON.stringify(payload));
  }
}

export function hasJoinadsDailyStorage(env) {
  const storage = getStorage(env);
  return !!(storage.db || storage.kv);
}

export async function fetchJoinadsDailyCached({ env, reportName, startDate, endDate, identity, fetchDay }) {
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
  const worker = async () => {
    while (cursor < days.length) {
      const index = cursor++;
      const day = days[index];
      const liveToday = day >= nowLocal.iso;
      const provisionalYesterday = day === yesterday && nowLocal.hour < finalHour;
      const finalizable = day < yesterday || (day === yesterday && nowLocal.hour >= finalHour);
      const key = await hashKey({ reportName, day, identity });
      let payload = finalizable ? await readStored(storage, key) : null;
      if (payload) {
        hits.push(day);
      } else {
        payload = await fetchDay(day);
        apiDays.push(day);
        if (provisionalYesterday) provisionalDays.push(day);
        if (finalizable) await writeStored(storage, key, reportName, day, payload);
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
      cacheHitDays: hits.sort(), apiDays: apiDays.sort(),
      provisionalDays: Array.from(new Set(provisionalDays)).sort(),
    },
  };
}
