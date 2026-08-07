import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/meta-adset-copy.js";

test("copia o conjunto para a nova campanha sem copiar os anuncios", async () => {
  const originalFetch = globalThis.fetch;
  let sentBody = null;
  globalThis.fetch = async (_url, options) => {
    sentBody = new URLSearchParams(options.body);
    return new Response(JSON.stringify({ copied_adset_id: "300" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const response = await onRequest({
      request: new Request("https://dashboard.test/api/meta-adset-copy", {
        method: "POST",
        body: JSON.stringify({
          adset_id: "101",
          campaign_id: "200",
          deep_copy: false,
          include_creative: false,
          status_option: "PAUSED",
        }),
      }),
      env: { META_ACCESS_TOKEN: "token" },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.new_adset_id, "300");
    assert.equal(sentBody.get("campaign_id"), "200");
    assert.equal(sentBody.get("deep_copy"), "false");
    assert.equal(sentBody.get("include_creative"), "false");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
