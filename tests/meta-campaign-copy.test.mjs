import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCampaignCopyResponse, onRequest } from "../functions/api/meta-campaign-copy.js";

test("normaliza o ID e o mapeamento retornados ao duplicar uma campanha", () => {
  assert.deepEqual(normalizeCampaignCopyResponse({
    copied_campaign_id: "200",
    ad_object_ids: [
      { ad_object_type: "campaign", source_id: "100", copied_id: "200" },
      { ad_object_type: "ad_set", source_id: "101", copied_id: "201" },
      { ad_object_type: "ad", source_id: "102", copied_id: "202" },
    ],
  }), {
    copied_campaign_id: "200",
    mappings: [
      { type: "campaign", source_id: "100", copied_id: "200" },
      { type: "ad_set", source_id: "101", copied_id: "201" },
      { type: "ad", source_id: "102", copied_id: "202" },
    ],
  });
});

test("usa o mapeamento da campanha quando copied_campaign_id nao vier no topo", () => {
  assert.equal(normalizeCampaignCopyResponse({
    ad_object_ids: [{ ad_object_type: "campaign", source_id: "100", copied_id: "200" }],
  }).copied_campaign_id, "200");
});

test("permite copiar apenas a campanha para montar os conjuntos separadamente", async () => {
  const originalFetch = globalThis.fetch;
  let sentBody = null;
  globalThis.fetch = async (_url, options) => {
    sentBody = new URLSearchParams(options.body);
    return new Response(JSON.stringify({ copied_campaign_id: "200" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const response = await onRequest({
      request: new Request("https://dashboard.test/api/meta-campaign-copy", {
        method: "POST",
        body: JSON.stringify({ campaign_id: "100", deep_copy: false }),
      }),
      env: { META_ACCESS_TOKEN: "token" },
    });
    assert.equal(response.status, 200);
    assert.equal(sentBody.get("deep_copy"), "false");
    assert.equal(sentBody.get("status_option"), "PAUSED");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
