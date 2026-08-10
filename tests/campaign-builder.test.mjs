import test from "node:test";
import assert from "node:assert/strict";
import {
  SITE_URL_TAGS,
  builderAdDraftFingerprint,
  materializeCampaignAdsets,
  nextBuilderNumber,
  resolveNicheCountryCodes,
  upsertBuilderAd,
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
  assert.match(SITE_URL_TAGS, /utm_term=\{\{adset\.id\}\}_\{\{ad\.id\}\}/);
  assert.doesNotMatch(SITE_URL_TAGS, /utm_content=/);
});

test("numeração continua após exclusões sem reutilizar CJ ou AN", () => {
  assert.equal(nextBuilderNumber(["02", "05", "03"]), "06");
  assert.equal(nextBuilderNumber([]), "01");
});

test("editar anúncio salvo substitui o original sem criar duplicidade", () => {
  const saved = [
    { _clientId: "ad:1", _anNum: "01", headline: "Original" },
    { _clientId: "ad:2", _anNum: "02", headline: "Outro" },
  ];
  const updated = upsertBuilderAd(
    saved,
    { _clientId: "ad:1", _anNum: "01", headline: "Editado" },
    "ad:1"
  );
  assert.equal(updated.length, 2);
  assert.equal(updated[0].headline, "Editado");
  assert.equal(updated[1].headline, "Outro");
});

test("salvar novo anúncio acrescenta um item", () => {
  const updated = upsertBuilderAd(
    [{ _clientId: "ad:1", _anNum: "01" }],
    { _clientId: "ad:2", _anNum: "02" }
  );
  assert.deepEqual(updated.map((ad) => ad._clientId), ["ad:1", "ad:2"]);
});

test("rascunho duplicado diferencia o novo AN sem depender do nome automatico", () => {
  const original = {
    _clientId: "ad:1",
    _anNum: "01",
    _nameManual: false,
    name: "saude-mx-cj01-an01",
    headline: "Headline mantida",
    body: "Texto mantido",
  };
  const next = {
    ...original,
    _clientId: "ad:2",
    _anNum: "02",
    name: "saude-mx-cj01-an02",
  };

  assert.notEqual(builderAdDraftFingerprint(original), builderAdDraftFingerprint(next));
  assert.equal(
    builderAdDraftFingerprint({ ...original, _clientId: "ad:outro", name: "outro nome automatico" }),
    builderAdDraftFingerprint(original)
  );
  assert.notEqual(
    builderAdDraftFingerprint({ ...original, headline: "Headline alterada" }),
    builderAdDraftFingerprint(original)
  );
});
