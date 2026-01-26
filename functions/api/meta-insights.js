import { jsonResponse, getQuery, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

export async function onRequest({ request, env }) {
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

  const missing = [];
  if (!account_id) missing.push("account_id");
  if (!start_date) missing.push("start_date");
  if (!end_date) missing.push("end_date");
  if (missing.length) {
    return jsonResponse(400, {
      error: `Parametros obrigatorios: ${missing.join(", ")}`,
    });
  }

  const q = new URLSearchParams();
  q.set(
    "fields",
    [
      "date_start",
      "campaign_name",
      "adset_id",
      "adset_name",
      "ad_name",
      "ad_id",
      "objective",
      "spend",
      "results",
      "cpm",
      "cost_per_result",
    ].join(",")
  );
  q.set("time_range", JSON.stringify({ since: start_date, until: end_date }));
  q.set("level", "ad");
  q.set("time_increment", "1");
  q.set("access_token", token);

  try {
    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(account_id)}/insights?${q.toString()}`
    );
    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, { error: "Erro Meta", details: data });
    }

    const insights = data.data || [];

    const adIds = Array.from(
      new Set(insights.map((row) => row.ad_id).filter(Boolean))
    );
    const statusMap = new Map();
    const chunkSize = 50;
    for (let i = 0; i < adIds.length; i += chunkSize) {
      const chunk = adIds.slice(i, i + chunkSize);
      try {
        const statusRes = await fetch(
          `${API_BASE}/?ids=${chunk.join(",")}&fields=status,effective_status&access_token=${token}`
        );
        const statusJson = await safeJson(statusRes);
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
      } catch (e) {
        // ignore
      }
    }

    const adsetIds = Array.from(
      new Set(insights.map((row) => row.adset_id).filter(Boolean))
    );
    const adsetBudgetMap = new Map();
    for (let i = 0; i < adsetIds.length; i += chunkSize) {
      const chunk = adsetIds.slice(i, i + chunkSize);
      try {
        const budgetRes = await fetch(
          `${API_BASE}/?ids=${chunk.join(",")}&fields=daily_budget,lifetime_budget,budget_remaining,status,effective_status&access_token=${token}`
        );
        const budgetJson = await safeJson(budgetRes);
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
              adsetBudgetMap.set(id, {
                adset_daily_budget: value.daily_budget,
                adset_lifetime_budget: value.lifetime_budget,
                adset_budget_remaining: value.budget_remaining,
                adset_status: value.status,
                adset_effective_status: value.effective_status,
              });
            }
          });
        }
      } catch (e) {
        // ignore
      }
    }

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
        if (budgetInfo.adset_status) {
          enriched.adset_status = budgetInfo.adset_status;
        }
        if (budgetInfo.adset_effective_status) {
          enriched.adset_effective_status = budgetInfo.adset_effective_status;
        }
      }
      return enriched;
    });

    if (!include_assets) {
      return jsonResponse(200, { code: "success", data: baseRows });
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

    return jsonResponse(200, { code: "success", data: withAssets });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao consultar Meta",
      details: error.message,
    });
  }
}
