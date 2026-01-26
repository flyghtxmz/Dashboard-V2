import { jsonResponse, readJson, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

const STRIP_KEYS = new Set([
  "degrees_of_freedom_spec",
  "standard_enhancements",
  "standard_enhancements_spec",
  "standard_enhancements_status",
]);

function dropRedundantImageFields(target) {
  if (!target || typeof target !== "object") return;
  if (target.image_hash && target.image_url) {
    delete target.image_url;
  }
  if (target.image_hash && target.picture) {
    delete target.picture;
  }
}

function normalizeStorySpec(spec) {
  if (!spec || typeof spec !== "object") return spec;
  if (spec.object_story_id) delete spec.object_story_id;
  if (spec.video_data) dropRedundantImageFields(spec.video_data);
  if (spec.photo_data) dropRedundantImageFields(spec.photo_data);
  if (spec.link_data) {
    dropRedundantImageFields(spec.link_data);
    if (Array.isArray(spec.link_data.child_attachments)) {
      spec.link_data.child_attachments.forEach(dropRedundantImageFields);
    }
  }
  if (spec.template_data) dropRedundantImageFields(spec.template_data);
  return spec;
}

function stripEnhancements(value) {
  if (Array.isArray(value)) {
    return value.map(stripEnhancements).filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    const next = {};
    Object.entries(value).forEach(([key, val]) => {
      if (STRIP_KEYS.has(key)) {
        return;
      }
      const cleaned = stripEnhancements(val);
      if (cleaned !== undefined) {
        next[key] = cleaned;
      }
    });
    return next;
  }
  return value;
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
  const { ad_id, adset_id, name, status } = body || {};
  if (!ad_id || !adset_id) {
    return jsonResponse(400, { error: "Parametros obrigatorios: ad_id, adset_id" });
  }

  try {
    const adRes = await fetch(
      `${API_BASE}/${encodeURIComponent(
        ad_id
      )}?fields=name,account_id,creative{object_story_spec,asset_feed_spec,effective_object_story_id,object_story_id,actor_id,instagram_actor_id}&access_token=${token}`
    );
    const adJson = await safeJson(adRes);
    if (!adRes.ok) {
      return jsonResponse(adRes.status, {
        error: "Erro Meta",
        details: adJson,
      });
    }

    const accountId = adJson?.account_id;
    if (!accountId) {
      return jsonResponse(400, { error: "account_id nao encontrado" });
    }

    const creative = adJson?.creative || {};
    let objectStorySpec = creative.object_story_spec
      ? stripEnhancements(creative.object_story_spec)
      : null;
    let assetFeedSpec = creative.asset_feed_spec
      ? stripEnhancements(creative.asset_feed_spec)
      : null;
    let objectStoryId =
      creative.object_story_id || creative.effective_object_story_id || null;

    if (objectStorySpec) {
      objectStorySpec = normalizeStorySpec(objectStorySpec);
    }

    if (objectStorySpec && !objectStorySpec.page_id && creative.actor_id) {
      objectStorySpec.page_id = creative.actor_id;
    }
    if (
      objectStorySpec &&
      !objectStorySpec.instagram_actor_id &&
      creative.instagram_actor_id
    ) {
      objectStorySpec.instagram_actor_id = creative.instagram_actor_id;
    }
    if (!objectStorySpec && assetFeedSpec && creative.actor_id) {
      objectStorySpec = {
        page_id: creative.actor_id,
        instagram_actor_id: creative.instagram_actor_id || undefined,
      };
    }

    if (objectStorySpec || assetFeedSpec) {
      objectStoryId = null;
    }

    if (!objectStorySpec && !assetFeedSpec && !objectStoryId) {
      return jsonResponse(400, {
        error: "Creative sem object_story_spec/asset_feed_spec/object_story_id",
      });
    }

    const creativeParams = new URLSearchParams();
    creativeParams.set("name", name || adJson?.name || "Copia");
    if (objectStoryId) {
      creativeParams.set("object_story_id", objectStoryId);
    }
    if (objectStorySpec) {
      creativeParams.set("object_story_spec", JSON.stringify(objectStorySpec));
    }
    if (assetFeedSpec) {
      creativeParams.set("asset_feed_spec", JSON.stringify(assetFeedSpec));
    }
    creativeParams.set("access_token", token);

    const creativeRes = await fetch(
      `${API_BASE}/act_${encodeURIComponent(accountId)}/adcreatives`,
      { method: "POST", body: creativeParams }
    );
    const creativeData = await safeJson(creativeRes);
    if (!creativeRes.ok) {
      return jsonResponse(creativeRes.status, {
        error: "Erro Meta",
        details: creativeData,
        stage: "create-creative",
      });
    }

    const newCreativeId = creativeData?.id;
    if (!newCreativeId) {
      return jsonResponse(400, { error: "creative_id nao gerado" });
    }

    const params = new URLSearchParams();
    params.set("name", name || adJson?.name || "Copia");
    params.set("status", status || "PAUSED");
    params.set("adset_id", adset_id);
    params.set("creative", JSON.stringify({ creative_id: newCreativeId }));
    params.set("access_token", token);

    const response = await fetch(
      `${API_BASE}/act_${encodeURIComponent(accountId)}/ads`,
      { method: "POST", body: params }
    );
    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, {
        error: "Erro Meta",
        details: data,
        stage: "create-ad",
      });
    }
    return jsonResponse(200, {
      code: "success",
      data,
      new_ad_id: data?.id || null,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao criar anuncio",
      details: error.message,
    });
  }
}
