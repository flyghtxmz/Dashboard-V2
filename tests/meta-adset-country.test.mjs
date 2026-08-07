import test from "node:test";
import assert from "node:assert/strict";
import { onRequest, replaceTargetingCountries } from "../functions/api/meta-adset-country.js";

test("troca somente a geolocalizacao e preserva o restante do targeting", () => {
  assert.deepEqual(replaceTargetingCountries({
    geo_locations: { countries: ["BR"], location_types: ["home"] },
    age_min: 25,
    targeting_automation: { advantage_audience: 1 },
  }, ["MX"]), {
    geo_locations: { countries: ["MX"], location_types: ["home"] },
    age_min: 25,
    targeting_automation: { advantage_audience: 1 },
  });
});

test("atualiza o pais do conjunto copiado na Meta", async () => {
  const originalFetch = globalThis.fetch;
  let updateBody = null;
  globalThis.fetch = async (_url, options = {}) => {
    if (!options.method) return Response.json({ targeting: { geo_locations: { countries: ["BR"] }, age_min: 18 } });
    updateBody = new URLSearchParams(options.body);
    return Response.json({ success: true });
  };
  try {
    const response = await onRequest({
      request: new Request("https://dashboard.test/api/meta-adset-country", {
        method: "POST",
        body: JSON.stringify({ adset_id: "123", countries: ["mx"] }),
      }),
      env: { META_ACCESS_TOKEN: "token" },
    });
    assert.equal(response.status, 200);
    const targeting = JSON.parse(updateBody.get("targeting"));
    assert.deepEqual(targeting.geo_locations.countries, ["MX"]);
    assert.equal(targeting.age_min, 18);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
