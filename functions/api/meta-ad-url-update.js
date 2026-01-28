import { jsonResponse, readJson, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function cleanSpec(spec) {
  const clean = deepClone(spec);
  delete clean.object_story_id;
  delete clean.effective_object_story_id;
  delete clean.standard_enhancements;
  delete clean.standard_enhancement;
  delete clean.auto_enhancements;
  delete clean.template_data;

  if (clean.link_data) {
    delete clean.link_data.object_story_id;
    delete clean.link_data.standard_enhancements;
    if (clean.link_data.image_hash && clean.link_data.image_url) {
      delete clean.link_data.image_url;
    }
  }
  if (clean.video_data) {
    delete clean.video_data.standard_enhancements;
    if (clean.video_data.image_hash && clean.video_data.image_url) {
      delete clean.video_data.image_url;
    }
  }
  if (clean.video_data?.video_id && clean.link_data) {
    delete clean.link_data;
  }
  return clean;
}

function applyUrl(spec, url) {
  let applied = false;
  if (spec.link_data) {
    spec.link_data.link = url;
    if (Array.isArray(spec.link_data.child_attachments)) {
      spec.link_data.child_attachments = spec.link_data.child_attachments.map(
        (child) => ({
          ...child,
          link: child.link || url,
        })
      );
    }
    applied = true;
  }
  if (spec.video_data?.call_to_action?.value) {
    spec.video_data.call_to_action.value.link = url;
    applied = true;
  }
  return applied;
}

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) {
    return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const body = await readJson(request);
  const ad_id = body.ad_id;
  const account_id_raw = body.account_id;
  const url = body.url;
  const url_tags = body.url_tags ?? "";

  const missing = [];
  if (!ad_id) missing.push("ad_id");
  if (!account_id_raw) missing.push("account_id");
  if (!url) missing.push("url");
  if (missing.length) {
    return jsonResponse(400, {
      error: `Parametros obrigatorios: ${missing.join(", ")}`,
    });
  }

  try {
    const creativeRes = await fetch(
      `${API_BASE}/${encodeURIComponent(
        ad_id
      )}?fields=creative{object_story_spec,url_tags,name}&access_token=${token}`
    );
    const creativeJson = await safeJson(creativeRes);
    if (!creativeRes.ok) {
      return jsonResponse(creativeRes.status, {
        error: "Erro Meta",
        details: creativeJson,
      });
    }

    const originalSpec = creativeJson?.creative?.object_story_spec || {};
    const clean = cleanSpec(originalSpec);
    const applied = applyUrl(clean, url);
    if (!applied) {
      return jsonResponse(400, {
        error: "Nao foi possivel aplicar URL",
      });
    }

    const accountId = account_id_raw.toString().replace(/^act_+/i, "");
    const createRes = await fetch(
      `${API_BASE}/act_${encodeURIComponent(accountId)}/adcreatives`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `URL Update - ${ad_id}`,
          object_story_spec: clean,
          url_tags: url_tags,
          access_token: token,
        }),
      }
    );
    const createJson = await safeJson(createRes);
    if (!createRes.ok) {
      const retrySpec = deepClone(clean);
      if (retrySpec.video_data?.video_id && retrySpec.link_data) {
        delete retrySpec.link_data;
      }
      const retryRes = await fetch(
        `${API_BASE}/act_${encodeURIComponent(accountId)}/adcreatives`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `URL Retry - ${ad_id}`,
            object_story_spec: retrySpec,
            access_token: token,
          }),
        }
      );
      const retryJson = await safeJson(retryRes);
      if (!retryRes.ok) {
        return jsonResponse(retryRes.status, {
          error: "Erro Meta",
          details: retryJson,
          stage: "create-creative",
        });
      }
      createJson.id = retryJson.id;
    }

    const creativeId = createJson.id;
    if (!creativeId) {
      return jsonResponse(500, {
        error: "Criativo nao criado",
        details: createJson,
      });
    }

    const updateRes = await fetch(`${API_BASE}/${encodeURIComponent(ad_id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creative: { creative_id: creativeId },
        access_token: token,
      }),
    });
    const updateJson = await safeJson(updateRes);
    if (!updateRes.ok) {
      return jsonResponse(updateRes.status, {
        error: "Erro Meta",
        details: updateJson,
        stage: "update-ad",
      });
    }

    return jsonResponse(200, {
      code: "success",
      data: {
        ad_id,
        creative_id: creativeId,
        url,
        url_tags,
      },
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao atualizar URL",
      details: error.message,
    });
  }
}
