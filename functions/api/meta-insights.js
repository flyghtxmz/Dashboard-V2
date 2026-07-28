import { jsonResponse, getQuery, getMetaToken, safeJson } from "../_utils.js";

import { getSession } from "../_auth.js";
import { loadSettings } from "../_settings.js";
import { validateDateRange } from "../_dates.js";

const API_BASE = "https://graph.facebook.com/v24.0";

// Retry com backoff exponencial em erros de rate-limit da Meta.
async function fetchWithRetry(url, maxRetries = 4) {
  let delay = 1000;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url);
    const json = await safeJson(res);
    const code = json?.error?.code;
    const isRateLimit = res.status === 429 || code === 17 || code === 32 || code === 4;
    if (isRateLimit && attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 16000);
      continue;
    }
    if (!res.ok) {
      const err = new Error("Meta API error");
      err.status = res.status;
      err.details = json;
      throw err;
    }
    return json;
  }
}

// Busca paginada: segue paging.next ate esgotar (com teto de seguranca).
async function fetchPaged(url, cap = 50000) {
  const results = [];
  let next = url;
  let pages = 0;
  let truncated = false;
  while (next) {
    const json = await fetchWithRetry(next);
    pages += 1;
    results.push(...(json.data || []));
    next = json?.paging?.next || null;
    if (results.length >= cap && next) {
      truncated = true;
      break;
    }
    if (next) await new Promise((r) => setTimeout(r, 200));
  }
  return { data: results.slice(0, cap), pages, truncated, cap };
}

export async function onRequest({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return jsonResponse(401, { error: "Sessao invalida ou expirada." });
  const token = getMetaToken(env);
  if (!token) {
    return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  }

  if (request.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const params = getQuery(request);
  const account_id = params.get("account_id");
  const start_date = params.get("start_date");
  const end_date = params.get("end_date");
  const include_assets =
    params.get("include_assets") === "1" ||
    params.get("include_assets") === "true";
  const summary_only =
    params.get("summary_only") === "1" ||
    params.get("summary_only") === "true";

  const missing = [];
  if (!account_id) missing.push("account_id");
  if (!start_date) missing.push("start_date");
  if (!end_date) missing.push("end_date");
  if (missing.length) {
    return jsonResponse(400, {
      error: `Parametros obrigatorios: ${missing.join(", ")}`,
    });
  }

  if (session.role !== "admin") {
    const settings = await loadSettings(env);
    if (!settings.metaAccountId || String(settings.metaAccountId) !== String(account_id)) {
      return jsonResponse(403, { error: "Conta Meta fora do escopo autorizado." });
    }
  }
  const dateRange = validateDateRange(start_date, end_date, 15);
  if (!dateRange.ok) return jsonResponse(400, { error: dateRange.error });

  const q = new URLSearchParams();
  q.set(
    "fields",
    [
      "date_start",
      "campaign_id",
      "campaign_name",
      "adset_id",
      "adset_name",
      "ad_name",
      "ad_id",
      "objective",
      "spend",
      "impressions",
      "reach",
      "frequency",
      "clicks",
      "actions",
      "cost_per_action_type",
      "results",
      "cpm",
      "cost_per_result",
    ].join(",")
  );
  q.set("time_range", JSON.stringify({ since: start_date, until: end_date }));
  q.set("level", "ad");
  q.set("time_increment", "1");
  q.set("limit", "500");
  q.set("access_token", token);

  try {
    const dailyPage = await fetchPaged(
      `${API_BASE}/${encodeURIComponent(account_id)}/insights?${q.toString()}`
    );
    if (dailyPage.truncated) {
      return jsonResponse(422, {
        error: "Relatorio Meta truncado; carga recusada para proteger a integridade.",
        diagnostics: { rows: dailyPage.data.length, pages: dailyPage.pages, cap: dailyPage.cap, truncated: true },
      });
    }
    const insights = dailyPage.data;

    // Comparacoes historicas precisam apenas das metricas diarias. Evita consultas extras
    // de alcance, status, orcamento, pagina e criativos quando nao existe filtro por pagina.
    if (summary_only) {
      return jsonResponse(200, {
        code: "success",
        data: insights,
        diagnostics: {
          dailyRows: dailyPage.data.length,
          dailyPages: dailyPage.pages,
          truncated: false,
          summaryOnly: true,
        },
      });
    }

    // Alcance e frequencia nao podem ser somados por dia. Esta consulta sem time_increment
    // traz os valores consolidados do periodo para cada anuncio.
    const periodQ = new URLSearchParams();
    periodQ.set("fields", "ad_id,reach,frequency");
    periodQ.set("time_range", JSON.stringify({ since: start_date, until: end_date }));
    periodQ.set("level", "ad");
    periodQ.set("limit", "500");
    periodQ.set("access_token", token);
    const periodPage = await fetchPaged(`${API_BASE}/${encodeURIComponent(account_id)}/insights?${periodQ.toString()}`);
    if (periodPage.truncated) {
      return jsonResponse(422, {
        error: "Alcance Meta consolidado truncado; carga recusada.",
        diagnostics: { rows: periodPage.data.length, pages: periodPage.pages, cap: periodPage.cap, truncated: true },
      });
    }
    const periodMetrics = new Map(periodPage.data.map((row) => [String(row.ad_id || ""), row]));
    insights.forEach((row) => {
      const period = periodMetrics.get(String(row.ad_id || ""));
      row.period_reach = period?.reach ?? null;
      row.period_frequency = period?.frequency ?? null;
    });

    const adIds = Array.from(
      new Set(insights.map((row) => row.ad_id).filter(Boolean))
    );
    const chunkSize = 50;

    // Busca status de ads e orçamentos em paralelo.
    const adChunks = [];
    for (let i = 0; i < adIds.length; i += chunkSize) adChunks.push(adIds.slice(i, i + chunkSize));

    const adsetIds = Array.from(
      new Set(insights.map((row) => row.adset_id).filter(Boolean))
    );
    const adsetChunks = [];
    for (let i = 0; i < adsetIds.length; i += chunkSize) adsetChunks.push(adsetIds.slice(i, i + chunkSize));
    const campaignIds = Array.from(
      new Set(insights.map((row) => row.campaign_id).filter(Boolean))
    );
    const campaignChunks = [];
    for (let i = 0; i < campaignIds.length; i += chunkSize) campaignChunks.push(campaignIds.slice(i, i + chunkSize));

    const [adStatusResults, adsetBudgetResults, campaignBudgetResults] = await Promise.all([
      Promise.all(
        adChunks.map((chunk) =>
          fetchWithRetry(`${API_BASE}/?ids=${chunk.join(",")}&fields=status,effective_status&access_token=${token}`)
        )
      ),
      Promise.all(
        adsetChunks.map((chunk) =>
          fetchWithRetry(`${API_BASE}/?ids=${chunk.join(",")}&fields=daily_budget,lifetime_budget,budget_remaining,status,effective_status,bid_amount,bid_strategy,optimization_goal,bid_constraints,promoted_object&access_token=${token}`)
        )
      ),
      Promise.all(
        campaignChunks.map((chunk) =>
          fetchWithRetry(`${API_BASE}/?ids=${chunk.join(",")}&fields=daily_budget,lifetime_budget,budget_remaining,status,effective_status&access_token=${token}`)
        )
      ),
    ]);

    const statusMap = new Map();
    adStatusResults.forEach((statusJson) => {
      if (statusJson && typeof statusJson === "object") {
        Object.entries(statusJson).forEach(([id, value]) => {
          if (value && (value.status || value.effective_status)) {
            statusMap.set(id, {
              ad_status: value.status,
              effective_status: value.effective_status,
            });
          }
        });
      }
    });

    const adsetBudgetMap = new Map();
    adsetBudgetResults.forEach((budgetJson) => {
      if (budgetJson && typeof budgetJson === "object") {
        Object.entries(budgetJson).forEach(([id, value]) => {
          if (
            value &&
            (value.daily_budget ||
              value.lifetime_budget ||
              value.budget_remaining ||
              value.bid_amount !== undefined ||
              value.bid_strategy ||
              value.optimization_goal ||
              value.bid_constraints ||
              value.promoted_object ||
              value.status ||
              value.effective_status)
          ) {
            adsetBudgetMap.set(id, {
              adset_daily_budget: value.daily_budget,
              adset_lifetime_budget: value.lifetime_budget,
              adset_budget_remaining: value.budget_remaining,
              adset_bid_amount: value.bid_amount,
              adset_bid_strategy: value.bid_strategy,
              adset_optimization_goal: value.optimization_goal,
              adset_bid_constraints: value.bid_constraints,
              adset_status: value.status,
              adset_effective_status: value.effective_status,
              adset_page_id: value.promoted_object && value.promoted_object.page_id
                ? String(value.promoted_object.page_id)
                : "",
            });
          }
        });
      }
    });

    const campaignBudgetMap = new Map();
    campaignBudgetResults.forEach((budgetJson) => {
      if (budgetJson && typeof budgetJson === "object") {
        Object.entries(budgetJson).forEach(([id, value]) => {
          if (
            value &&
            (value.daily_budget ||
              value.lifetime_budget ||
              value.budget_remaining ||
              value.status ||
              value.effective_status)
          ) {
            campaignBudgetMap.set(id, {
              campaign_daily_budget: value.daily_budget,
              campaign_lifetime_budget: value.lifetime_budget,
              campaign_budget_remaining: value.budget_remaining,
              campaign_status: value.status,
              campaign_effective_status: value.effective_status,
            });
          }
        });
      }
    });

    const baseRows = insights.map((row) => {
      const enriched = { ...row };
      const statusInfo = statusMap.get(row.ad_id);
      if (statusInfo) {
        enriched.ad_status = statusInfo.ad_status;
        enriched.effective_status = statusInfo.effective_status;
      }
      const budgetInfo = adsetBudgetMap.get(row.adset_id);
      if (budgetInfo) {
        enriched.adset_daily_budget = budgetInfo.adset_daily_budget;
        enriched.adset_lifetime_budget = budgetInfo.adset_lifetime_budget;
        enriched.adset_budget_remaining = budgetInfo.adset_budget_remaining;
        if (budgetInfo.adset_bid_amount !== undefined) {
          enriched.adset_bid_amount = budgetInfo.adset_bid_amount;
        }
        if (budgetInfo.adset_bid_strategy) {
          enriched.adset_bid_strategy = budgetInfo.adset_bid_strategy;
        }
        if (budgetInfo.adset_optimization_goal) {
          enriched.adset_optimization_goal = budgetInfo.adset_optimization_goal;
        }
        if (budgetInfo.adset_bid_constraints) {
          enriched.adset_bid_constraints = budgetInfo.adset_bid_constraints;
        }
        if (budgetInfo.adset_status) {
          enriched.adset_status = budgetInfo.adset_status;
        }
        if (budgetInfo.adset_effective_status) {
          enriched.adset_effective_status = budgetInfo.adset_effective_status;
        }
        if (budgetInfo.adset_page_id) {
          enriched.page_id = budgetInfo.adset_page_id;
        }
      }
      const campaignBudgetInfo = campaignBudgetMap.get(row.campaign_id);
      if (campaignBudgetInfo) {
        enriched.campaign_daily_budget = campaignBudgetInfo.campaign_daily_budget;
        enriched.campaign_lifetime_budget = campaignBudgetInfo.campaign_lifetime_budget;
        enriched.campaign_budget_remaining = campaignBudgetInfo.campaign_budget_remaining;
        if (campaignBudgetInfo.campaign_status) {
          enriched.campaign_status = campaignBudgetInfo.campaign_status;
        }
        if (campaignBudgetInfo.campaign_effective_status) {
          enriched.campaign_effective_status =
            campaignBudgetInfo.campaign_effective_status;
        }
      }
      return enriched;
    });

    // Nome das Paginas (Facebook) para segmentar Metricas Mensagens por Pagina.
    // Uma unica chamada em lote por ate 50 ids; o page_id vem do promoted_object do conjunto.
    const pageIds = Array.from(
      new Set(baseRows.map((row) => row.page_id).filter(Boolean))
    );
    if (pageIds.length) {
      const pageChunks = [];
      for (let i = 0; i < pageIds.length; i += chunkSize) pageChunks.push(pageIds.slice(i, i + chunkSize));
      const pageNameResults = await Promise.all(
        pageChunks.map((chunk) =>
          fetch(`${API_BASE}/?ids=${chunk.join(",")}&fields=name&access_token=${token}`)
            .then(safeJson)
            .catch(() => ({}))
        )
      );
      const pageNameMap = new Map();
      pageNameResults.forEach((json) => {
        if (json && typeof json === "object") {
          Object.entries(json).forEach(([id, value]) => {
            if (value && value.name) pageNameMap.set(id, value.name);
          });
        }
      });
      baseRows.forEach((row) => {
        if (row.page_id) row.page_name = pageNameMap.get(row.page_id) || "";
      });
    }

    if (!include_assets) {
      return jsonResponse(200, { code: "success", data: baseRows, diagnostics: { dailyRows: dailyPage.data.length, dailyPages: dailyPage.pages, periodRows: periodPage.data.length, periodPages: periodPage.pages, truncated: false } });
    }

    const withAssets = await Promise.all(
      baseRows.map(async (row) => {
        const enriched = { ...row };
        if (!row.ad_id) return enriched;
        try {
          const creativeRes = await fetch(
            `${API_BASE}/${encodeURIComponent(row.ad_id)}?fields=creative{object_story_spec{photo_data{image_hash},video_data{video_id},link_data{picture}}}&access_token=${token}`
          );
          const creativeJson = await safeJson(creativeRes);
          const spec = creativeJson?.creative?.object_story_spec || {};

          const videoId = spec.video_data?.video_id;
          if (videoId) {
            const videoRes = await fetch(
              `${API_BASE}/${encodeURIComponent(videoId)}?fields=source&access_token=${token}`
            );
            const videoJson = await safeJson(videoRes);
            if (videoJson?.source) {
              enriched.asset_url = videoJson.source;
              enriched.asset_type = "video";
              return enriched;
            }
          }

          const imageHash = spec.photo_data?.image_hash;
          if (imageHash) {
            const imgRes = await fetch(
              `${API_BASE}/act_${encodeURIComponent(
                account_id
              )}/adimages?fields=permalink_url&hashes=["${imageHash}"]&access_token=${token}`
            );
            const imgJson = await safeJson(imgRes);
            const match = imgJson?.data?.find((d) => d.hash === imageHash);
            if (match?.permalink_url) {
              enriched.asset_url = match.permalink_url;
              enriched.asset_type = "image";
              return enriched;
            }
          }

          const linkPic = spec.link_data?.picture;
          if (linkPic) {
            enriched.asset_url = linkPic;
            enriched.asset_type = "image";
          }
        } catch (e) {
          // ignore
        }
        return enriched;
      })
    );

    return jsonResponse(200, { code: "success", data: withAssets, diagnostics: { dailyRows: dailyPage.data.length, dailyPages: dailyPage.pages, periodRows: periodPage.data.length, periodPages: periodPage.pages, truncated: false } });
  } catch (error) {
    return jsonResponse(error.status || 500, {
      error: "Erro ao consultar Meta",
      details: error.details || error.message,
    });
  }
}

