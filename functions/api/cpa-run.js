import { jsonResponse, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value.replace?.(",", ".") || value);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function sumActions(actions) {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((acc, act) => acc + toNumber(act?.value), 0);
}

function formatDateUTC(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function fetchAdsetStatuses(ids, token) {
  const statusMap = new Map();
  const chunkSize = 50;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const res = await fetch(
      `${API_BASE}/?ids=${chunk.join(",")}&fields=status,effective_status&access_token=${token}`
    );
    const json = await safeJson(res);
    if (json && typeof json === "object") {
      Object.entries(json).forEach(([id, value]) => {
        if (value && (value.status || value.effective_status)) {
          statusMap.set(id, {
            status: value.status,
            effective_status: value.effective_status,
          });
        }
      });
    }
  }
  return statusMap;
}

async function fetchInsightsByAdset(accountId, adsetIds, token, since, until) {
  const chunkSize = 50;
  const metrics = new Map();
  for (let i = 0; i < adsetIds.length; i += chunkSize) {
    const chunk = adsetIds.slice(i, i + chunkSize);
    const q = new URLSearchParams();
    q.set(
      "fields",
      ["adset_id", "adset_name", "spend", "actions"].join(",")
    );
    q.set("level", "adset");
    q.set("time_range", JSON.stringify({ since, until }));
    q.set(
      "filtering",
      JSON.stringify([
        { field: "adset.id", operator: "IN", value: chunk },
      ])
    );
    q.set("access_token", token);
    const res = await fetch(
      `${API_BASE}/${encodeURIComponent(accountId)}/insights?${q.toString()}`
    );
    const json = await safeJson(res);
    if (!res.ok) {
      const err = new Error("Erro Meta");
      err.details = json;
      throw err;
    }
    (json.data || []).forEach((row) => {
      const adsetId = row.adset_id;
      if (!adsetId) return;
      const existing = metrics.get(adsetId) || {
        spend: 0,
        results: 0,
        name: row.adset_name || "",
      };
      existing.spend += toNumber(row.spend);
      existing.results += sumActions(row.actions);
      metrics.set(adsetId, existing);
    });
  }
  return metrics;
}

async function pauseAdset(adsetId, token) {
  const params = new URLSearchParams();
  params.set("status", "PAUSED");
  params.set("access_token", token);
  const res = await fetch(`${API_BASE}/${encodeURIComponent(adsetId)}`, {
    method: "POST",
    body: params,
  });
  const json = await safeJson(res);
  if (!res.ok) {
    const err = new Error("Erro Meta");
    err.details = json;
    throw err;
  }
  return json;
}

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) {
    return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  }

  const secret = env.CPA_CRON_SECRET;
  const incomingSecret =
    request.headers.get("x-cron-secret") ||
    new URL(request.url).searchParams.get("secret");
  if (secret && incomingSecret !== secret) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const url = new URL(request.url);
  const accountId = url.searchParams.get("account_id");
  if (!accountId) {
    return jsonResponse(400, { error: "Parametros obrigatorios: account_id" });
  }

  const kv = env.CPA_RULES_KV;
  if (!kv) {
    return jsonResponse(500, { error: "CPA_RULES_KV nao configurado" });
  }

  try {
    const raw = await kv.get(`rules:${accountId}`);
    const parsed = raw ? JSON.parse(raw) : null;
    const rules = parsed?.rules || {};
    const entries = Object.entries(rules);
    if (!entries.length) {
      return jsonResponse(200, { code: "success", message: "Sem regras" });
    }

    const allAdsetIds = Array.from(
      new Set(
        entries.flatMap(([, rule]) => rule?.adset_ids || [])
      )
    ).filter(Boolean);

    if (!allAdsetIds.length) {
      return jsonResponse(200, { code: "success", message: "Sem conjuntos" });
    }

    const now = new Date();
    const since = url.searchParams.get("since") || formatDateUTC(now);
    const until = url.searchParams.get("until") || formatDateUTC(now);

    const [statusMap, metrics] = await Promise.all([
      fetchAdsetStatuses(allAdsetIds, token),
      fetchInsightsByAdset(accountId, allAdsetIds, token, since, until),
    ]);

    const paused = [];
    const skipped = [];
    for (const [, rule] of entries) {
      const ids = (rule?.adset_ids || []).filter(Boolean);
      if (!ids.length) continue;
      let totalSpend = 0;
      let totalResults = 0;
      ids.forEach((id) => {
        const m = metrics.get(id);
        if (m) {
          totalSpend += m.spend;
          totalResults += m.results;
        }
      });

      const cpaLimit = rule?.cpa != null ? Number(rule.cpa) : null;
      const spendLimit = rule?.spend != null ? Number(rule.spend) : null;
      const cpaValue =
        totalResults > 0 ? totalSpend / totalResults : null;
      const exceedSpend =
        spendLimit != null && totalSpend > spendLimit;
      const exceedCpa =
        cpaLimit != null
          ? cpaValue != null
            ? cpaValue > cpaLimit
            : totalSpend > 0
          : false;

      if (!(exceedSpend || exceedCpa)) continue;

      for (const id of ids) {
        const status =
          (statusMap.get(id)?.effective_status || statusMap.get(id)?.status || "")
            .toUpperCase();
        if (status && status !== "ACTIVE") {
          skipped.push({ id, status });
          continue;
        }
        try {
          await pauseAdset(id, token);
          paused.push(id);
        } catch (err) {
          skipped.push({ id, error: err.details || err.message });
        }
      }
    }

    return jsonResponse(200, {
      code: "success",
      paused,
      skipped,
      since,
      until,
    });
  } catch (err) {
    return jsonResponse(500, {
      error: "Erro ao executar regra",
      details: err.details || err.message,
    });
  }
}
