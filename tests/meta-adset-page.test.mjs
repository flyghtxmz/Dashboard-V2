import test from "node:test";
import assert from "node:assert/strict";
import { onRequest, replacePromotedObjectPage } from "../functions/api/meta-adset-page.js";

test("troca a Pagina do conjunto sem perder pixel e evento", async () => {
  assert.deepEqual(replacePromotedObjectPage({
    page_id: "100",
    pixel_id: "pixel-1",
    custom_event_type: "PURCHASE",
  }, "200"), {
    page_id: "200",
    pixel_id: "pixel-1",
    custom_event_type: "PURCHASE",
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options = {}) => {
    if (options.method !== "POST") {
      return Response.json({ promoted_object: { page_id: "100", pixel_id: "pixel-1", custom_event_type: "PURCHASE" } });
    }
    assert.deepEqual(JSON.parse(options.body.get("promoted_object")), {
      page_id: "200",
      pixel_id: "pixel-1",
      custom_event_type: "PURCHASE",
    });
    return Response.json({ success: true });
  };
  try {
    const response = await onRequest({
      request: new Request("https://dashboard.test/api/meta-adset-page", {
        method: "POST",
        body: JSON.stringify({ adset_id: "123", page_id: "200" }),
      }),
      env: { META_ACCESS_TOKEN: "token" },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.changed, true);
    assert.equal(payload.promoted_object.pixel_id, "pixel-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
