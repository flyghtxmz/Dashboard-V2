import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/meta-structure.js";

test("preserva campanha e conjunto sem anuncios na estrutura canonica", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith("/campaigns")) {
      return Response.json({
        data: [{ id: "cmp-1", name: "Vendas site", objective: "OUTCOME_SALES", status: "PAUSED" }],
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
    assert.equal(body.structure[0].adsets.length, 1);
    assert.equal(body.structure[0].adsets[0].id, "set-1");
    assert.deepEqual(body.structure[0].adsets[0].ads, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
