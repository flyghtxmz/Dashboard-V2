import test from "node:test";
import assert from "node:assert/strict";
import {
  SITE_URL_TAGS,
  materializeCampaignAdsets,
  nextBuilderNumber,
  resolveNicheCountryCodes,
} from "../campaign-builder.mjs";

test("converte paises antigos do nicho para ISO sem separar acentos", () => {
  const countries = [
    { code: "MX", name: "México" },
    { code: "CR", name: "Costa Rica" },
    { code: "DO", name: "Rep. Dominicana" },
  ];
  assert.deepEqual(
    resolveNicheCountryCodes({ paises: ["Mexico", "Costa Rica", "Rep. Dominicana"] }, countries),
    ["MX", "CR", "DO"]
  );
});

test("materializa quantidades diferentes de anuncios por conjunto", () => {
  const adsets = [
    { _clientId: "set-1", _cjNum: "01", name: "México", countries: ["MX"] },
    { _clientId: "set-2", _cjNum: "02", name: "Chile", countries: ["CL"] },
  ];
  const ads = [
    { _anNum: "01", _nameManual: false, _targetAdsetIds: ["set-1", "set-2"], headline: "A" },
    { _anNum: "02", _nameManual: false, _targetAdsetIds: ["set-1"], headline: "B" },
    { _anNum: "03", _nameManual: true, _targetAdsetIds: ["set-2"], name: "Nome manual" },
  ];

  const result = materializeCampaignAdsets({ adsets, ads, niche: { slug: "saude" } });
  assert.equal(result[0].ads.length, 2);
  assert.equal(result[1].ads.length, 2);
  assert.equal(result[0].ads[0].name, "saude-mx-cj01-an01");
  assert.equal(result[1].ads[0].name, "saude-cl-cj02-an01");
  assert.equal(result[1].ads[1].name, "Nome manual");
  assert.equal("_clientId" in result[0], false);
  assert.equal("_targetAdsetIds" in result[0].ads[0], false);
});

test("UTM de site usa IDs estáveis nos três níveis", () => {
  assert.match(SITE_URL_TAGS, /utm_campaign=\{\{campaign\.id\}\}/);
  assert.match(SITE_URL_TAGS, /utm_term=\{\{adset\.id\}\}/);
  assert.match(SITE_URL_TAGS, /utm_content=\{\{ad\.id\}\}/);
});

test("numeração continua após exclusões sem reutilizar CJ ou AN", () => {
  assert.equal(nextBuilderNumber(["02", "05", "03"]), "06");
  assert.equal(nextBuilderNumber([]), "01");
});
