import { jsonResponse, getQuery, getMetaToken, safeJson } from "../_utils.js";
import { getSession } from "../_auth.js";
import { loadSettings } from "../_settings.js";

const API_BASE = "https://graph.facebook.com/v24.0";
const CACHE_TTL_MS = 20 * 60 * 1000;
const MAX_UPLOAD_FILES = 10;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_BYTES = 95 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime"]);

function normalizeAccountId(value) {
  return String(value || "").trim().replace(/^act_/i, "");
}

function accountPath(value) {
  const normalized = normalizeAccountId(value);
  return normalized ? `act_${normalized}` : "";
}

function normalizeFolder(value) {
  return String(value || "geral")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "geral";
}

function metaErrorMessage(details, fallback = "Erro na API da Meta") {
  return details?.error?.error_user_msg || details?.error?.message || details?.message || fallback;
}

// Retry a fetch on rate-limit / transient Meta errors.
async function fetchWithRetry(url, options = {}, maxRetries = 4, fetchImpl = fetch) {
  let delay = 1000;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetchImpl(url, options);
    const json = await safeJson(res);
    const metaCode = json?.error?.code;
    const isRetryable = res.status === 429 || res.status >= 500 || metaCode === 17 || metaCode === 32;

    if (isRetryable && attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
      continue;
    }
    if (!res.ok) {
      throw Object.assign(new Error(metaErrorMessage(json)), { details: json, status: res.status });
    }
    return json;
  }
  throw new Error("A Meta nao respondeu ao upload.");
}

async function fetchPaged(url, fetchImpl = fetch) {
  const results = [];
  let next = url;
  while (next) {
    const json = await fetchWithRetry(next, {}, 4, fetchImpl);
    results.push(...(json.data || []));
    next = json?.paging?.next || null;
    if (results.length >= 500) break;
    if (next) await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return results;
}

function mediaKind(file) {
  const type = String(file?.type || "").toLowerCase();
  if (IMAGE_TYPES.has(type)) return "image";
  if (VIDEO_TYPES.has(type)) return "video";
  return "";
}

export function validateMediaUpload(file) {
  if (!file || typeof file.arrayBuffer !== "function" || !String(file.name || "").trim()) {
    return "Arquivo invalido.";
  }
  const kind = mediaKind(file);
  if (!kind) return "Formato nao aceito. Use JPG, PNG, MP4 ou MOV.";
  const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (Number(file.size || 0) <= 0) return "O arquivo esta vazio.";
  if (Number(file.size || 0) > maxBytes) {
    return kind === "image"
      ? "A imagem excede o limite de 30 MB."
      : "O video excede o limite de 95 MB deste Dashboard.";
  }
  return "";
}

function firstUploadedImage(data) {
  const images = data?.images && typeof data.images === "object" ? Object.values(data.images) : [];
  return images.find((image) => image?.hash) || null;
}

export async function uploadImageToMeta({ accountId, token, file, fetchImpl = fetch }) {
  const form = new FormData();
  form.append("filename", file, file.name);
  form.append("access_token", token);
  const data = await fetchWithRetry(
    `${API_BASE}/${encodeURIComponent(accountPath(accountId))}/adimages`,
    { method: "POST", body: form },
    2,
    fetchImpl
  );
  const image = firstUploadedImage(data);
  if (!image) {
    throw Object.assign(new Error("A Meta aceitou a requisicao, mas nao devolveu o hash da imagem."), { details: data });
  }
  return {
    key: String(image.hash),
    type: "image",
    name: image.name || file.name,
    url: image.url || image.url_128 || "",
    width: image.width || null,
    height: image.height || null,
    created_time: new Date().toISOString(),
    upload_status: "ready",
  };
}

export async function uploadVideoToMeta({ accountId, token, file, fetchImpl = fetch }) {
  const form = new FormData();
  form.append("source", file, file.name);
  form.append("title", file.name.replace(/\.[^.]+$/, ""));
  form.append("access_token", token);
  const data = await fetchWithRetry(
    `${API_BASE}/${encodeURIComponent(accountPath(accountId))}/advideos`,
    { method: "POST", body: form },
    1,
    fetchImpl
  );
  if (!data?.id) {
    throw Object.assign(new Error("A Meta aceitou a requisicao, mas nao devolveu o ID do video."), { details: data });
  }
  return {
    key: String(data.id),
    type: "video",
    name: file.name,
    url: data.picture || "",
    duration: null,
    created_time: new Date().toISOString(),
    upload_status: "processing",
  };
}

async function readObject(kv, key) {
  if (!kv) return {};
  try {
    const parsed = JSON.parse(await kv.get(key) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function persistUploadedLabels(kv, accountId, uploaded, folder) {
  if (!kv || !uploaded.length) return;
  const labelsKey = `media_labels:${accountId}`;
  const current = await readObject(kv, labelsKey);
  const uploadedAt = new Date().toISOString();
  uploaded.forEach((item) => {
    current[item.key] = {
      ...(current[item.key] || {}),
      label: item.name,
      folder,
      hidden: false,
      uploadedAt,
      uploadedByDashboard: true,
    };
  });
  await kv.put(labelsKey, JSON.stringify(current));

  const foldersKey = `media_folders:${accountId}`;
  const folders = await readObject(kv, foldersKey);
  folders[folder] = folders[folder] || { name: folder, createdAt: uploadedAt };
  await kv.put(foldersKey, JSON.stringify(folders));
}

async function authorizeAccount(request, env, accountId) {
  const session = await getSession(request, env);
  if (!session) return { ok: false, response: jsonResponse(401, { error: "Sessao invalida ou expirada." }) };
  if (session.role !== "admin") {
    const settings = await loadSettings(env);
    if (!settings.metaAccountId || normalizeAccountId(settings.metaAccountId) !== normalizeAccountId(accountId)) {
      return { ok: false, response: jsonResponse(403, { error: "Conta Meta fora do escopo autorizado." }) };
    }
  }
  return { ok: true };
}

async function handleUpload(request, env, token) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse(400, { error: "Envie os arquivos como multipart/form-data." });
  }
  const accountId = normalizeAccountId(form.get("account_id"));
  if (!accountId) return jsonResponse(400, { error: "Parametro obrigatorio: account_id" });
  const authorization = await authorizeAccount(request, env, accountId);
  if (!authorization.ok) return authorization.response;

  const files = [...form.getAll("file"), ...form.getAll("files")]
    .filter((file) => file && typeof file.arrayBuffer === "function");
  if (!files.length) return jsonResponse(400, { error: "Selecione pelo menos um arquivo." });
  if (files.length > MAX_UPLOAD_FILES) {
    return jsonResponse(400, { error: `Envie no maximo ${MAX_UPLOAD_FILES} arquivos por vez.` });
  }

  const folder = normalizeFolder(form.get("folder"));
  const uploaded = [];
  const failures = [];
  for (const file of files) {
    const validationError = validateMediaUpload(file);
    if (validationError) {
      failures.push({ name: file?.name || "arquivo", error: validationError });
      continue;
    }
    try {
      const item = mediaKind(file) === "image"
        ? await uploadImageToMeta({ accountId, token, file })
        : await uploadVideoToMeta({ accountId, token, file });
      uploaded.push(item);
    } catch (error) {
      failures.push({
        name: file.name,
        error: metaErrorMessage(error.details, error.message || "Falha no upload"),
        details: error.details || null,
      });
    }
  }

  const kv = env.CPA_RULES_KV || env.DASHBOARD_KV;
  try {
    await persistUploadedLabels(kv, accountId, uploaded, folder);
    if (kv && uploaded.length) await kv.delete(`media_list:${accountId}`);
  } catch (error) {
    failures.push({ name: "organizacao", error: `Upload concluido, mas a pasta nao foi salva: ${error.message}` });
  }

  const status = uploaded.length ? 200 : 400;
  return jsonResponse(status, {
    code: uploaded.length ? (failures.length ? "partial" : "success") : "error",
    data: { uploaded, failures, folder },
  });
}

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });

  if (request.method === "POST") return handleUpload(request, env, token);

  if (request.method === "DELETE") {
    const params = getQuery(request);
    const key = params.get("key");
    const type = params.get("type");
    if (!key || !type) return jsonResponse(400, { error: "Parametros obrigatorios: key, type" });
    const accountId = normalizeAccountId(params.get("account_id"));
    if (!accountId) return jsonResponse(400, { error: "Parametro obrigatorio: account_id" });
    const authorization = await authorizeAccount(request, env, accountId);
    if (!authorization.ok) return authorization.response;

    if (type === "video") {
      const t = encodeURIComponent(token);
      const res = await fetch(`${API_BASE}/${encodeURIComponent(key)}?access_token=${t}`, { method: "DELETE" });
      const json = await safeJson(res);
      if (!res.ok) return jsonResponse(res.status, { error: "Erro ao deletar video na Meta", details: json });
      const kv = env.CPA_RULES_KV || env.DASHBOARD_KV;
      if (kv && accountId) await kv.delete(`media_list:${accountId}`);
      return jsonResponse(200, { code: "success", deleted: true });
    }

    const kv = env.CPA_RULES_KV || env.DASHBOARD_KV;
    if (!kv) return jsonResponse(500, { error: "KV nao configurado" });
    const labelsKey = `media_labels:${accountId}`;
    const existing = await readObject(kv, labelsKey);
    existing[key] = { ...(existing[key] || {}), deleted: true };
    await kv.put(labelsKey, JSON.stringify(existing));
    return jsonResponse(200, { code: "success", deleted: true, note: "Imagem ocultada localmente" });
  }

  if (request.method !== "GET") return jsonResponse(405, { error: "Method not allowed" });

  const params = getQuery(request);
  const accountId = normalizeAccountId(params.get("account_id"));
  if (!accountId) return jsonResponse(400, { error: "Parametro obrigatorio: account_id" });
  const authorization = await authorizeAccount(request, env, accountId);
  if (!authorization.ok) return authorization.response;

  const force = params.get("force") === "1" || params.get("force") === "true";
  const kv = env.CPA_RULES_KV || env.DASHBOARD_KV;
  const cacheKey = `media_list:${accountId}`;

  if (kv && !force) {
    try {
      const cached = await kv.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const age = Date.now() - (parsed._cachedAt || 0);
        if (age < CACHE_TTL_MS) {
          delete parsed._cachedAt;
          return jsonResponse(200, { code: "success", cached: true, data: parsed });
        }
      }
    } catch {
      // Cache miss/corrupt: fetch live data.
    }
  }

  const act = accountPath(accountId);
  const t = encodeURIComponent(token);
  try {
    const [rawImages, rawVideos] = await Promise.all([
      fetchPaged(`${API_BASE}/${encodeURIComponent(act)}/adimages?fields=hash,name,url,url_128,width,height,created_time&limit=200&access_token=${t}`),
      fetchPaged(`${API_BASE}/${encodeURIComponent(act)}/advideos?fields=id,title,picture,length,status,created_time&limit=200&access_token=${t}`),
    ]);

    const images = rawImages.map((image) => ({
      key: image.hash,
      type: "image",
      name: image.name || image.hash,
      url: image.url || image.url_128 || "",
      width: image.width,
      height: image.height,
      created_time: image.created_time,
      upload_status: "ready",
    }));
    const videos = rawVideos.map((video) => ({
      key: video.id,
      type: "video",
      name: video.title || video.id,
      url: video.picture || "",
      duration: video.length,
      created_time: video.created_time,
      upload_status: video.status?.video_status || video.status || "unknown",
    }));
    const payload = { images, videos };

    if (kv) {
      try {
        await kv.put(cacheKey, JSON.stringify({ ...payload, _cachedAt: Date.now() }), {
          expirationTtl: Math.ceil((CACHE_TTL_MS * 2) / 1000),
        });
      } catch {
        // Cache write is non-fatal.
      }
    }
    return jsonResponse(200, { code: "success", cached: false, data: payload });
  } catch (error) {
    return jsonResponse(error.status || 500, {
      error: "Erro ao buscar midias",
      message: metaErrorMessage(error.details, error.message),
      details: error.details || null,
    });
  }
}
