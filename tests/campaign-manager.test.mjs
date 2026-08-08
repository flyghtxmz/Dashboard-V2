import test from "node:test";
import assert from "node:assert/strict";
import { buildCampaignCopyStructure, buildModelDraftNames, nextAnName, nextCampaignCjToken, nextCampaignCopyName, readBudgetDraft, replaceCjToken, resolveManagedUrlTags, shiftCjName } from "../campaign-manager.mjs";

test("incrementa CJ usando o maior conjunto existente na campanha", () => {
  const campaign = {
    adsets: [
      { name: "aplicativos-mx-cj01", ads: [] },
      { name: "aplicativos-mx-cj03", ads: [] },
    ],
  };
  assert.equal(nextCampaignCjToken(campaign, campaign.adsets[0]), "cj04");
});

test("gera o proximo AN para uma nova copia dentro do conjunto", () => {
  assert.equal(
    nextAnName("aplicativos-cj02-an01", ["aplicativos-cj02-an01", "aplicativos-cj02-an02"]),
    "aplicativos-cj02-an03"
  );
  assert.equal(nextAnName("criativo-cj01", []), "criativo-cj01-an01");
});

test("aplica o novo CJ no conjunto e em todos os anuncios", () => {
  const adset = {
    name: "aplicativos-mx-cj01",
    ads: [{ id: "ad-1", name: "aplicativos-mx-cj01-an01" }],
  };
  const names = buildModelDraftNames({ adsets: [adset] }, adset);
  assert.equal(names.cjToken, "cj02");
  assert.equal(names.adsetName, "aplicativos-mx-cj02");
  assert.equal(names.adNames.get("ad-1"), "aplicativos-mx-cj02-an01");
  assert.equal(replaceCjToken("aplicativos-an01", "cj02"), "aplicativos-cj02-an01");
  assert.equal(shiftCjName("aplicativos-cj02-an01", 2), "aplicativos-cj04-an01");
});

test("Gerenciar aplica UTM oficial em vendas e preserva a origem em mensagens", () => {
  const siteTags = "utm_medium=paid_social&utm_campaign={{campaign.id}}";
  assert.equal(
    resolveManagedUrlTags({ trafficType: "sales", sourceUrlTags: "", siteUrlTags: siteTags }),
    siteTags
  );
  assert.equal(
    resolveManagedUrlTags({ trafficType: "messages", sourceUrlTags: "?utm_campaign=src_abc", siteUrlTags: siteTags }),
    "utm_campaign=src_abc"
  );
});

test("gera o proximo nome ao duplicar uma campanha sem alterar o nicho", () => {
  assert.equal(nextCampaignCopyName("cmp-02-eng-aplicativos", [
    { name: "cmp-02-eng-aplicativos" },
    { name: "cmp-03-eng-aplicativos" },
    { name: "cmp-20-vnd-outro" },
  ]), "cmp-04-eng-aplicativos");
  assert.equal(nextCampaignCopyName("Mensagens MX", []), "Mensagens MX - Copia");
});

test("reinicia CJ e AN ao montar a estrutura de uma nova campanha", () => {
  const structure = buildCampaignCopyStructure({ adsets: [
    { id: "set-9", name: "produto-mx-cj09", targeting: { geo_locations: { countries: ["MX"] } }, ads: [
      { id: "ad-8", name: "produto-mx-cj09-an08", url_tags: "utm_source=fb", page_id: "page-1" },
      { id: "ad-12", name: "produto-mx-cj09-an12" },
    ] },
    { id: "set-15", name: "produto-mx-cj15", ads: [
      { id: "ad-4", name: "produto-mx-cj15-an04" },
    ] },
  ] });
  assert.equal(structure[0].new_name, "produto-mx-cj01");
  assert.equal(structure[0].ads[0].new_name, "produto-mx-cj01-an01");
  assert.equal(structure[0].ads[1].new_name, "produto-mx-cj01-an02");
  assert.equal(structure[1].new_name, "produto-mx-cj02");
  assert.equal(structure[1].ads[0].new_name, "produto-mx-cj02-an01");
  assert.equal(structure[0].ads[0].url_tags, "utm_source=fb");
  assert.deepEqual(structure[0].countries, ["MX"]);
  assert.equal(structure[0].ads[0].page_id, "page-1");
});

test("preserva o orcamento no nivel correto ao duplicar campanha", () => {
  assert.deepEqual(readBudgetDraft({ daily_budget: "3500" }), {
    budget_type: "daily",
    budget_brl: "35.00",
  });
  assert.deepEqual(readBudgetDraft({ lifetime_budget: "12000" }), {
    budget_type: "lifetime",
    budget_brl: "120.00",
  });

  const structure = buildCampaignCopyStructure({
    adsets: [{ id: "set-1", name: "produto-cj01", daily_budget: "2750", ads: [] }],
  });
  assert.equal(structure[0].budget_type, "daily");
  assert.equal(structure[0].budget_brl, "27.50");
});
