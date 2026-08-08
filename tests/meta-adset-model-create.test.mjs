import test from "node:test";
import assert from "node:assert/strict";
import { buildModeledAdsetParams, onRequest } from "../functions/api/meta-adset-model-create.js";

test("cria novo conjunto com a Pagina correta e preserva pixel e configuracoes", async () => {
  const source = {
    name: "Modelo",
    account_id: "123",
    billing_event: "IMPRESSIONS",
    optimization_goal: "OFFSITE_CONVERSIONS",
    destination_type: "WEBSITE",
    targeting: { geo_locations: { countries: ["BR"] }, locales: [16] },
    promoted_object: { page_id: "100", pixel_id: "pixel-1", custom_event_type: "PURCHASE" },
    daily_budget: "2500",
  };
  const modeled = buildModeledAdsetParams(source, {
    campaignId: "456",
    pageId: "200",
    name: "Novo conjunto",
  });
  assert.deepEqual(JSON.parse(modeled.params.get("promoted_object")), {
    page_id: "200",
    pixel_id: "pixel-1",
    custom_event_type: "PURCHASE",
  });
  assert.deepEqual(JSON.parse(modeled.params.get("targeting")), source.targeting);
  assert.equal(modeled.params.get("daily_budget"), "2500");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options = {}) => {
    if (options.method !== "POST") return Response.json(source);
    assert.equal(options.body.get("campaign_id"), "456");
    assert.equal(JSON.parse(options.body.get("promoted_object")).page_id, "200");
    assert.equal(JSON.parse(options.body.get("promoted_object")).pixel_id, "pixel-1");
    return Response.json({ id: "789" });
  };
  try {
    const response = await onRequest({
      request: new Request("https://dashboard.test/api/meta-adset-model-create", {
        method: "POST",
        body: JSON.stringify({
          source_adset_id: "111",
          campaign_id: "456",
          page_id: "200",
          name: "Novo conjunto",
          status: "PAUSED",
        }),
      }),
      env: { META_ACCESS_TOKEN: "token" },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.adset_id, "789");
    assert.equal(payload.promoted_object.pixel_id, "pixel-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
