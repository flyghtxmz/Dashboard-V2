const API_BASE = "https://graph.facebook.com/v24.0";

module.exports = async function handler(req, res) {
  const token = process.env.META_ACCESS_TOKEN || process.env.META_TOKEN;
  if (!token) {
    res.status(500).json({ error: "META_ACCESS_TOKEN não configurado" });
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { account_id, start_date, end_date } = req.query || {};
  const missing = [];
  if (!account_id) missing.push("account_id");
  if (!start_date) missing.push("start_date");
  if (!end_date) missing.push("end_date");

  if (missing.length) {
    res
      .status(400)
      .json({ error: `Parâmetros obrigatórios: ${missing.join(", ")}` });
    return;
  }

  const params = new URLSearchParams();
  params.set("fields", [
    "date_start",
    "campaign_name",
    "adset_name",
    "ad_name",
    "ad_id",
    "objective",
    "spend",
    "results",
    "cpm",
    "cost_per_result",
  ].join(","));
  params.set(
    "time_range",
    JSON.stringify({ since: start_date, until: end_date })
  );
  params.set("level", "ad");
  params.set("time_increment", "1");
  params.set("access_token", token);

  try {
    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(account_id)}/insights?${params.toString()}`
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      res.status(response.status).json({ error: "Erro Meta", details: data });
      return;
    }
    const insights = data.data || [];

    // Enriquecer com permalink do criativo (best-effort)
    const withAssets = await Promise.all(
      insights.map(async (row) => {
        const enriched = { ...row };
        if (!row.ad_id) return enriched;
        try {
          // Puxa object_story_spec para descobrir imagem ou vídeo
          const creativeRes = await fetch(
            `${API_BASE}/${encodeURIComponent(row.ad_id)}?fields=creative{object_story_spec{photo_data{image_hash},video_data{video_id},link_data{picture}}}&access_token=${token}`
          );
          const creativeJson = await creativeRes.json().catch(() => ({}));
          const spec = creativeJson?.creative?.object_story_spec || {};

          // 1) Vídeo direto
          const videoId = spec.video_data?.video_id;
          if (videoId) {
            const videoRes = await fetch(
              `${API_BASE}/${encodeURIComponent(videoId)}?fields=source&access_token=${token}`
            );
            const videoJson = await videoRes.json().catch(() => ({}));
            if (videoJson?.source) {
              enriched.asset_url = videoJson.source;
              enriched.asset_type = "video";
              return enriched;
            }
          }

          // 2) Imagem via hash -> permalink_url do CDN
          const imageHash = spec.photo_data?.image_hash;
          if (imageHash) {
            const imgRes = await fetch(
              `${API_BASE}/act_${encodeURIComponent(
                account_id
              )}/adimages?fields=permalink_url&hashes=["${imageHash}"]&access_token=${token}`
            );
            const imgJson = await imgRes.json().catch(() => ({}));
            const match = imgJson?.data?.find((d) => d.hash === imageHash);
            if (match?.permalink_url) {
              enriched.asset_url = match.permalink_url;
              enriched.asset_type = "image";
              return enriched;
            }
          }

          // 3) Link_data picture (fallback)
          const linkPic = spec.link_data?.picture;
          if (linkPic) {
            enriched.asset_url = linkPic;
            enriched.asset_type = "image";
          }
        } catch (e) {
          // silencioso; segue sem permalink
        }
        return enriched;
      })
    );

    res.status(200).json({ code: "success", data: withAssets });
  } catch (error) {
    res.status(500).json({ error: "Erro ao consultar Meta", details: error.message });
  }
};
