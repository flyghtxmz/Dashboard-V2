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
  delete clean.instagram_user_id;
  delete clean.instagram_user;

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
    if (clean.video_data.call_to_action?.value?.link) {
      delete clean.video_data.call_to_action.value.link;
    }
    if (
      clean.video_data.call_to_action &&
      Object.keys(clean.video_data.call_to_action.value || {}).length === 0
    ) {
      delete clean.video_data.call_to_action.value;
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
    if (spec.video_data.call_to_action.value.link) {
      delete spec.video_data.call_to_action.value.link;
    }
  }
  if (spec.video_data) applied = true;
  return applied;
}

function buildUrlTagsFromUrl(url) {
  try {
    const parsed = new URL(url);
    const keys = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ad_id",
    ];
    const parts = [];
    keys.forEach((k) => {
      const v = parsed.searchParams.get(k);
      if (v != null) {
        parts.push(`${k}=${v}`);
      }
    });
    return parts.join("&");
  } catch (e) {
    return "";
  }
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
      )}?fields=creative{object_story_spec,object_story_id,effective_object_story_id,url_tags,name,object_type,asset_feed_spec,image_hash,video_id,instagram_actor_id,call_to_action_type,link_url,object_url}&access_token=${token}`
    );
    const creativeJson = await safeJson(creativeRes);
    if (!creativeRes.ok) {
      return jsonResponse(creativeRes.status, {
        error: "Erro Meta",
        details: creativeJson,
      });
    }

    const creative = creativeJson?.creative || {};
    const originalSpec = creative.object_story_spec || {};
    const clean = cleanSpec(originalSpec);
    const applied = applyUrl(clean, url);
    if (!applied) {
      return jsonResponse(400, {
        error: "Nao foi possivel aplicar URL",
      });
    }

    const accountId = account_id_raw.toString().replace(/^act_+/i, "");
    const tagsFromUrl = buildUrlTagsFromUrl(url);
    const storyId =
      creative.object_story_id || creative.effective_object_story_id || "";
    const useStoryId = !!storyId;
    const createPayload = useStoryId
      ? {
          name: `URL Update - ${ad_id}`,
          object_story_id: storyId,
          url_tags: url_tags || tagsFromUrl,
          access_token: token,
        }
      : {
          name: `URL Update - ${ad_id}`,
          object_story_spec: clean,
          url_tags: url_tags || tagsFromUrl,
          object_type: creative.object_type,
          access_token: token,
        };
    Object.keys(createPayload).forEach((key) => {
      if (
        createPayload[key] === undefined ||
        createPayload[key] === null ||
        createPayload[key] === ""
      ) {
        delete createPayload[key];
      }
    });
    const createRes = await fetch(
      `${API_BASE}/act_${encodeURIComponent(accountId)}/adcreatives`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createPayload),
      }
    );
    const createJson = await safeJson(createRes);
    if (!createRes.ok && !useStoryId) {
      const retrySpec = deepClone(clean);
      if (retrySpec.video_data?.video_id && retrySpec.link_data) {
        delete retrySpec.link_data;
      }
      const retryPayload = {
        name: `URL Retry - ${ad_id}`,
        object_story_spec: retrySpec,
        url_tags: url_tags || tagsFromUrl,
        access_token: token,
      };
      const retryRes = await fetch(
        `${API_BASE}/act_${encodeURIComponent(accountId)}/adcreatives`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(retryPayload),
        }
      );
      const retryJson = await safeJson(retryRes);
      if (!retryRes.ok) {
        const minimalSpec = deepClone(retrySpec);
        if (minimalSpec.link_data) {
          delete minimalSpec.link_data.message;
          delete minimalSpec.link_data.caption;
          delete minimalSpec.link_data.description;
          delete minimalSpec.link_data.call_to_action;
          delete minimalSpec.link_data.child_attachments;
        }
        if (minimalSpec.video_data) {
          delete minimalSpec.video_data.message;
          delete minimalSpec.video_data.call_to_action;
          delete minimalSpec.video_data.title;
          delete minimalSpec.video_data.link_description;
        }
        const minimalPayload = {
          name: `URL Retry2 - ${ad_id}`,
          object_story_spec: minimalSpec,
          url_tags: url_tags || tagsFromUrl,
          degrees_of_freedom_spec: {
            creative_features_spec: {
              standard_enhancements: { enroll_status: "OPT_OUT" },
            },
          },
          access_token: token,
        };
        const thirdRes = await fetch(
          `${API_BASE}/act_${encodeURIComponent(accountId)}/adcreatives`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(minimalPayload),
          }
        );
        const thirdJson = await safeJson(thirdRes);
        if (!thirdRes.ok) {
          const scrub = (payload) => {
            if (!payload || typeof payload !== "object") return payload;
            const copy = { ...payload };
            delete copy.access_token;
            return copy;
          };
          return jsonResponse(thirdRes.status, {
            error: "Erro Meta",
            details: thirdJson,
            stage: "create-creative",
            attempts: [
              { type: useStoryId ? "story-id" : "default", payload: scrub(createPayload), error: createJson },
              { type: "retry", payload: scrub(retryPayload), error: retryJson },
              { type: "minimal", payload: scrub(minimalPayload), error: thirdJson },
            ],
          });
        }
        createJson.id = thirdJson.id;
      } else {
        createJson.id = retryJson.id;
      }
    }
    if (!createRes.ok && useStoryId) {
      return jsonResponse(createRes.status, {
        error: "Erro Meta",
        details: createJson,
        stage: "create-creative",
        attempts: [
          { type: "story-id", payload: { name: createPayload.name, object_story_id: createPayload.object_story_id, url_tags: createPayload.url_tags }, error: createJson },
        ],
      });
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
