import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/meta-adset-create.js";

test("cria conjunto pausado dentro de campanha de vendas existente", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = options.body;
    assert.equal(body.get("campaign_id"), "cmp-1");
    assert.equal(body.get("status"), "PAUSED");
    assert.equal(body.get("daily_budget"), "2500");
    assert.deepEqual(JSON.parse(body.get("targeting")).geo_locations.countries, ["BR"]);
    assert.deepEqual(JSON.parse(body.get("targeting")).locales, [5]);
    assert.equal(JSON.parse(body.get("promoted_object")).pixel_id, "pixel-1");
    return new Response(JSON.stringify({ id: "adset-new" }), { status: 200 });
  };
  try {
    const response = await onRequest({
      request: new Request("https://example.com/api/meta-adset-create", {
        method: "POST",
        body: JSON.stringify({
          account_id: "123",
          campaign_id: "cmp-1",
          adset: {
            name: "Novo conjunto",
            daily_budget: 2500,
            countries: ["BR"],
            pixel_id: "pixel-1",
            locales: [5],
          },
        }),
      }),
      env: { META_ACCESS_TOKEN: "token" },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).adset_id, "adset-new");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("bloqueia conversoes sem pixel antes de chamar a Meta", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return Response.json({ id: "unexpected" });
  };
  try {
    const response = await onRequest({
      request: new Request("https://example.com/api/meta-adset-create", {
        method: "POST",
        body: JSON.stringify({
          account_id: "123",
          campaign_id: "cmp-1",
          adset: {
            name: "Conversoes",
            daily_budget: 1000,
            countries: ["BR"],
            optimization_goal: "OFFSITE_CONVERSIONS",
          },
        }),
      }),
      env: { META_ACCESS_TOKEN: "token" },
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
