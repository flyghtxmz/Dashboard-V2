import test from "node:test";
import assert from "node:assert/strict";
import {
  uploadImageToMeta,
  uploadVideoToMeta,
  validateMediaUpload,
} from "../functions/api/meta-media.js";
import { onRequest as handleMediaLabels } from "../functions/api/media-labels.js";

function namedBlob(name, type, bytes = 128) {
  const blob = new Blob([new Uint8Array(bytes)], { type });
  Object.defineProperty(blob, "name", { value: name });
  return blob;
}

test("valida formatos e limites antes de enviar para a Meta", () => {
  assert.equal(validateMediaUpload(namedBlob("criativo.jpg", "image/jpeg")), "");
  assert.equal(validateMediaUpload(namedBlob("criativo.mp4", "video/mp4")), "");
  assert.match(validateMediaUpload(namedBlob("criativo.svg", "image/svg+xml")), /Formato nao aceito/);
  assert.match(validateMediaUpload(namedBlob("vazio.png", "image/png", 0)), /vazio/);
});

test("upload de imagem usa adimages e devolve o hash utilizavel no anuncio", async () => {
  let request = null;
  const item = await uploadImageToMeta({
    accountId: "123",
    token: "token-teste",
    file: namedBlob("imagem.png", "image/png"),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        images: { "imagem.png": { hash: "hash-meta", url: "https://meta.test/imagem", width: 1080, height: 1080 } },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  assert.match(request.url, /act_123\/adimages$/);
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.body.get("access_token"), "token-teste");
  assert.equal(item.key, "hash-meta");
  assert.equal(item.type, "image");
  assert.equal(item.upload_status, "ready");
});

test("upload de video usa advideos e marca processamento assincrono", async () => {
  const item = await uploadVideoToMeta({
    accountId: "act_456",
    token: "token-teste",
    file: namedBlob("video.mp4", "video/mp4"),
    fetchImpl: async (url) => {
      assert.match(url, /act_456\/advideos$/);
      return new Response(JSON.stringify({ id: "video-meta" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  assert.equal(item.key, "video-meta");
  assert.equal(item.type, "video");
  assert.equal(item.upload_status, "processing");
});

test("pastas sao persistidas com nome normalizado e aceitam conta com ou sem act_", async () => {
  const store = new Map();
  const env = {
    DASHBOARD_KV: {
      get: async (key) => store.get(key) || null,
      put: async (key, value) => store.set(key, value),
    },
  };
  const createResponse = await handleMediaLabels({
    request: new Request("https://dashboard.test/api/media-labels?account_id=act_123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ create_folder: "Criativos México" }),
    }),
    env,
  });
  const created = await createResponse.json();
  assert.equal(created.created_folder, "criativos-mexico");

  const listResponse = await handleMediaLabels({
    request: new Request("https://dashboard.test/api/media-labels?account_id=123"),
    env,
  });
  const listed = await listResponse.json();
  assert.deepEqual(listed.folders, ["criativos-mexico"]);
});

test("renomeia pasta e ao excluir preserva os criativos em geral", async () => {
  const store = new Map();
  const env = {
    DASHBOARD_KV: {
      get: async (key) => store.get(key) || null,
      put: async (key, value) => store.set(key, value),
    },
  };
  await handleMediaLabels({
    request: new Request("https://dashboard.test/api/media-labels?account_id=123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        create_folder: "originais",
        labels: { hash1: { label: "Criativo 1", folder: "originais" } },
      }),
    }),
    env,
  });

  const renameResponse = await handleMediaLabels({
    request: new Request("https://dashboard.test/api/media-labels?account_id=123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rename_folder: { from: "originais", to: "aprovados" }, item_keys: ["hash1"] }),
    }),
    env,
  });
  const renamed = await renameResponse.json();
  assert.deepEqual(renamed.folders, ["aprovados"]);
  assert.equal(renamed.data.hash1.folder, "aprovados");

  const deleteResponse = await handleMediaLabels({
    request: new Request("https://dashboard.test/api/media-labels?account_id=123&folder=aprovados", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_keys: ["hash1"] }),
    }),
    env,
  });
  const deleted = await deleteResponse.json();
  assert.equal(deleted.deleted_folder, "aprovados");
  assert.equal(deleted.moved_to, "geral");
  assert.equal(deleted.data.hash1.folder, "geral");
  assert.deepEqual(deleted.folders, ["geral"]);
});
