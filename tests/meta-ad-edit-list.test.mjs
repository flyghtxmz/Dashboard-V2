import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/meta-ad-edit-list.js";

test("reaproveita a estrutura dos anuncios e devolve pagina sem consultas de nome redundantes", async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/ads")) {
      assert.match(parsed.searchParams.get("fields"), /promoted_object/);
      return Response.json({
        data: [{
          id: "ad-1",
          name: "Anuncio 1",
          status: "ACTIVE",
          effective_status: "ACTIVE",
          adset_id: "set-1",
          adset_name: "Conjunto 1",
          adset: {
            id: "set-1",
            name: "Conjunto 1",
            promoted_object: { page_id: "page-1" },
          },
          campaign_id: "cmp-1",
          campaign_name: "Campanha 1",
          campaign: { id: "cmp-1", name: "Campanha 1", objective: "OUTCOME_ENGAGEMENT" },
          creative: {},
        }],
      });
    }
    if (parsed.pathname === "/v24.0/") {
      assert.equal(parsed.searchParams.get("ids"), "page-1");
      return Response.json({ "page-1": { id: "page-1", name: "Pagina Carla" } });
    }
    return Response.json({ data: [] });
  };

  try {
    const response = await onRequest({
      request: new Request("https://example.com/api/meta-ad-edit-list?account_id=act_123"),
      env: { META_ACCESS_TOKEN: "token" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].page_id, "page-1");
    assert.equal(body.data[0].page_name, "Pagina Carla");
    assert.equal(body.data[0].campaign_name, "Campanha 1");
    assert.equal(body.data[0].adset_name, "Conjunto 1");
    assert.equal(urls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
