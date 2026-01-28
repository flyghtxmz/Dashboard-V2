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
  const story_id = params.get("object_story_id");
  if (!story_id) {
    return jsonResponse(400, { error: "Parametros obrigatorios: object_story_id" });
  }

  const q = new URLSearchParams();
  q.set("fields", "permalink_url,link,attachments{url,media{source,image{src}},type}");
  q.set("access_token", token);

  try {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(story_id)}?${q.toString()}`);
    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, { error: "Erro Meta", details: data });
    }

    const attachments = Array.isArray(data.attachments?.data)
      ? data.attachments.data
      : [];
    const attachmentUrl =
      attachments.find((item) => item.url)?.url ||
      attachments.find((item) => item.media?.source)?.media?.source ||
      attachments.find((item) => item.media?.image?.src)?.media?.image?.src ||
      "";

    return jsonResponse(200, {
      code: "success",
      data: {
        object_story_id: story_id,
        link: data.link || "",
        permalink_url: data.permalink_url || "",
        attachment_url: attachmentUrl,
      },
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao consultar post",
      details: error.message,
    });
  }
}
