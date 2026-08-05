import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/meta-locales.js";

test("usa os IDs de idioma devolvidos pela própria Meta", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /type=adlocale/);
    return new Response(JSON.stringify({
      data: [{ key: "16", name: "Portuguese (Brazil)" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const response = await onRequest({
      request: new Request("https://example.com/api/meta-locales"),
      env: { META_ACCESS_TOKEN: "token" },
    });
    const body = await response.json();
    assert.deepEqual(body.data, [{ id: 16, label: "Portuguese (Brazil)" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
