import { jsonResponse, getQuery, readJson } from "../_utils.js";

function labelsKey(accountId) {
  return `media_labels:${accountId}`;
}

function foldersKey(accountId) {
  return `media_folders:${accountId}`;
}

function normalizeFolder(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function readObject(kv, key) {
  try {
    const parsed = JSON.parse(await kv.get(key) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizeLabels(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clean = {};
  Object.entries(value).slice(0, 100).forEach(([key, label]) => {
    const safeKey = String(key || "").trim().slice(0, 256);
    if (!safeKey || safeKey === "__proto__" || !label || typeof label !== "object" || Array.isArray(label)) return;
    clean[safeKey] = {
      ...(typeof label.label === "string" ? { label: label.label.trim().slice(0, 180) } : {}),
      ...(typeof label.folder === "string" ? { folder: normalizeFolder(label.folder) || "geral" } : {}),
      ...(typeof label.hidden === "boolean" ? { hidden: label.hidden } : {}),
      ...(typeof label.deleted === "boolean" ? { deleted: label.deleted } : {}),
      ...(typeof label.uploadedAt === "string" ? { uploadedAt: label.uploadedAt.slice(0, 40) } : {}),
      ...(typeof label.uploadedByDashboard === "boolean" ? { uploadedByDashboard: label.uploadedByDashboard } : {}),
    };
  });
  return clean;
}

function sanitizeItemKeys(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .slice(0, 500)
    .map((key) => String(key || "").trim().slice(0, 256))
    .filter((key) => key && key !== "__proto__"))];
}

export async function onRequest({ request, env }) {
  const kv = env.CPA_RULES_KV || env.DASHBOARD_KV;
  if (!kv) return jsonResponse(500, { error: "KV nao configurado" });

  const params = getQuery(request);
  const rawAccountId = String(params.get("account_id") || "").trim();
  const accountId = rawAccountId.replace(/^act_/i, "");
  if (!accountId) return jsonResponse(400, { error: "Parametro obrigatorio: account_id" });

  const readAccountData = async (keyBuilder) => {
    const primary = await readObject(kv, keyBuilder(accountId));
    if (!rawAccountId || rawAccountId === accountId) return primary;
    const legacy = await readObject(kv, keyBuilder(rawAccountId));
    return { ...legacy, ...primary };
  };

  if (request.method === "GET") {
    const [labels, folders] = await Promise.all([
      readAccountData(labelsKey),
      readAccountData(foldersKey),
    ]);
    return jsonResponse(200, { code: "success", data: labels, folders: Object.keys(folders).sort() });
  }

  if (request.method === "POST") {
    const body = await readJson(request);
    const incoming = sanitizeLabels(body?.labels);
    const [current, folders] = await Promise.all([
      readAccountData(labelsKey),
      readAccountData(foldersKey),
    ]);
    const merged = { ...current };
    Object.entries(incoming).forEach(([key, patch]) => {
      merged[key] = { ...(current[key] || {}), ...patch };
      if (patch.folder) folders[patch.folder] = folders[patch.folder] || { name: patch.folder, createdAt: new Date().toISOString() };
    });

    const createdFolder = normalizeFolder(body?.create_folder);
    if (body?.create_folder !== undefined && !createdFolder) {
      return jsonResponse(400, { error: "Informe um nome valido para a pasta." });
    }
    if (createdFolder) folders[createdFolder] = folders[createdFolder] || { name: createdFolder, createdAt: new Date().toISOString() };

    let renamedFolder = null;
    if (body?.rename_folder !== undefined) {
      const from = normalizeFolder(body?.rename_folder?.from);
      const to = normalizeFolder(body?.rename_folder?.to);
      if (!from || !to) return jsonResponse(400, { error: "Informe os nomes atual e novo da pasta." });
      if (from === "geral") return jsonResponse(400, { error: "A pasta geral nao pode ser renomeada." });
      const itemKeys = new Set(sanitizeItemKeys(body?.item_keys));
      Object.entries(merged).forEach(([key, label]) => {
        if (label?.folder === from || itemKeys.has(key)) merged[key] = { ...(label || {}), folder: to };
      });
      itemKeys.forEach((key) => {
        merged[key] = { ...(merged[key] || {}), folder: to };
      });
      delete folders[from];
      folders[to] = folders[to] || { name: to, createdAt: new Date().toISOString() };
      renamedFolder = { from, to, moved: itemKeys.size };
    }

    await Promise.all([
      kv.put(labelsKey(accountId), JSON.stringify(merged)),
      kv.put(foldersKey(accountId), JSON.stringify(folders)),
    ]);
    return jsonResponse(200, {
      code: "success",
      data: merged,
      folders: Object.keys(folders).sort(),
      created_folder: createdFolder || null,
      renamed_folder: renamedFolder,
    });
  }

  if (request.method === "DELETE") {
    const body = await readJson(request);
    const folder = normalizeFolder(params.get("folder") || body?.folder);
    if (!folder) return jsonResponse(400, { error: "Informe a pasta que sera excluida." });
    if (folder === "geral") return jsonResponse(400, { error: "A pasta geral nao pode ser excluida." });
    const [current, folders] = await Promise.all([
      readAccountData(labelsKey),
      readAccountData(foldersKey),
    ]);
    const itemKeys = new Set(sanitizeItemKeys(body?.item_keys));
    let moved = 0;
    Object.entries(current).forEach(([key, label]) => {
      if (label?.folder === folder || itemKeys.has(key)) {
        current[key] = { ...(label || {}), folder: "geral" };
        moved += 1;
      }
    });
    itemKeys.forEach((key) => {
      if (current[key]?.folder !== "geral") moved += 1;
      current[key] = { ...(current[key] || {}), folder: "geral" };
    });
    delete folders[folder];
    if (moved) folders.geral = folders.geral || { name: "geral", createdAt: new Date().toISOString() };
    await Promise.all([
      kv.put(labelsKey(accountId), JSON.stringify(current)),
      kv.put(foldersKey(accountId), JSON.stringify(folders)),
    ]);
    return jsonResponse(200, {
      code: "success",
      data: current,
      folders: Object.keys(folders).sort(),
      deleted_folder: folder,
      moved_to: "geral",
      moved,
    });
  }

  return jsonResponse(405, { error: "Method not allowed" });
}
