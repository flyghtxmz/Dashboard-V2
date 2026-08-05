import test from "node:test";
import assert from "node:assert/strict";
import { validateMetaCampaignCreationPayload } from "../functions/api/meta-campaign-create.js";

const validCampaign = {
  name: "cmp-01-vnd-saude",
  objective: "OUTCOME_SALES",
  status: "PAUSED",
};

const validAdset = {
  name: "saude-vnd-mx-cj01",
  optimization_goal: "OFFSITE_CONVERSIONS",
  bid_strategy: "LOWEST_COST_WITHOUT_CAP",
  destination_type: "WEBSITE",
  daily_budget: 3000,
  countries: ["MX"],
  age_min: 18,
  age_max: 65,
  pixel_id: "123",
  ads: [{
    name: "saude-mx-cj01-an01",
    page_id: "456",
    headline: "Título",
    destination_url: "https://example.com/artigo",
    url_tags: "utm_campaign={{campaign.id}}",
    ad_format: "image",
    image_url: "https://example.com/image.jpg",
    status: "PAUSED",
  }],
};

test("aceita payload de site completo e pausado", () => {
  assert.deepEqual(validateMetaCampaignCreationPayload(validCampaign, [validAdset]), []);
});

test("bloqueia destino ainda sem adaptador", () => {
  const errors = validateMetaCampaignCreationPayload(validCampaign, [{
    ...validAdset,
    destination_type: "MESSENGER",
  }]);
  assert.ok(errors.some((message) => message.includes("adaptador MESSENGER")));
});

test("bloqueia conversao sem pixel e pais fora de ISO", () => {
  const errors = validateMetaCampaignCreationPayload(validCampaign, [{
    ...validAdset,
    countries: ["México"],
    pixel_id: "",
  }]);
  assert.ok(errors.some((message) => message.includes("codigos ISO")));
  assert.ok(errors.some((message) => message.includes("pixel")));
});

test("bloqueia orcamento vitalicio sem termino", () => {
  const { daily_budget, ...withoutDaily } = validAdset;
  const errors = validateMetaCampaignCreationPayload(validCampaign, [{
    ...withoutDaily,
    lifetime_budget: 10000,
  }]);
  assert.ok(errors.some((message) => message.includes("termino")));
});

test("bloqueia objetivo desconhecido e destino divergente no anuncio", () => {
  const errors = validateMetaCampaignCreationPayload(
    { ...validCampaign, objective: "QUALQUER_COISA" },
    [{ ...validAdset, ads: [{ ...validAdset.ads[0], destination_type: "MESSENGER" }] }]
  );
  assert.ok(errors.some((message) => message.includes("Objetivo")));
  assert.ok(errors.some((message) => message.includes("diverge")));
});

test("protege o endpoint de publicacoes grandes por engano", () => {
  const errors = validateMetaCampaignCreationPayload(
    validCampaign,
    Array.from({ length: 51 }, (_, index) => ({ ...validAdset, name: `CJ ${index + 1}` }))
  );
  assert.ok(errors.some((message) => message.includes("50 conjuntos")));
});
