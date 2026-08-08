import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/meta-structure.js";

test("preserva campanha e conjunto sem anuncios na estrutura canonica", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith("/campaigns")) {
      return Response.json({
        data: [{ id: "cmp-1", name: "Vendas site", objective: "OUTCOME_SALES", status: "PAUSED", daily_budget: "4500" }],
      });
    }
    if (pathname.endsWith("/adsets")) {
      return Response.json({
        data: [{ id: "set-1", campaign_id: "cmp-1", name: "Conjunto novo", status: "PAUSED" }],
      });
    }
    return Response.json({ data: [] });
  };

  try {
    const response = await onRequest({
      request: new Request("https://example.com/api/meta-structure?account_id=123"),
      env: { META_ACCESS_TOKEN: "token" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.length, 0);
    assert.equal(body.structure.length, 1);
    assert.equal(body.structure[0].objective, "OUTCOME_SALES");
    assert.equal(body.structure[0].daily_budget, "4500");
    assert.equal(body.structure[0].adsets.length, 1);
    assert.equal(body.structure[0].adsets[0].id, "set-1");
    assert.deepEqual(body.structure[0].adsets[0].ads, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolve o preview pelo image_hash real da biblioteca da conta", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith("/campaigns")) return Response.json({ data: [{ id: "cmp-1", name: "Campanha" }] });
    if (pathname.endsWith("/adsets")) return Response.json({ data: [{ id: "set-1", campaign_id: "cmp-1", name: "CJ" }] });
    if (pathname.endsWith("/ads")) {
      return Response.json({ data: [{
        id: "ad-1",
        adset_id: "set-1",
        campaign_id: "cmp-1",
        name: "AN",
        creative: {
          image_hash: "selected-hash",
          thumbnail_url: "https://meta.test/preview-antigo.jpg",
          actor_id: "page-1",
          instagram_actor_id: "ig-1",
        },
      }] });
    }
    if (pathname.endsWith("/adimages")) {
      assert.match(new URL(url).searchParams.get("hashes"), /selected-hash/);
      return Response.json({ data: [{
        hash: "selected-hash",
        url_128: "https://meta.test/imagem-correta.jpg",
      }] });
    }
    return Response.json({ data: [] });
  };

  try {
    const response = await onRequest({
      request: new Request("https://example.com/api/meta-structure?account_id=123&force=1"),
      env: { META_ACCESS_TOKEN: "token" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    const ad = body.structure[0].adsets[0].ads[0];
    assert.equal(ad.image_hash, "selected-hash");
    assert.equal(ad.thumbnail_url, "https://meta.test/imagem-correta.jpg");
    assert.equal(ad.page_id, "page-1");
    assert.equal(ad.instagram_actor_id, "ig-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
