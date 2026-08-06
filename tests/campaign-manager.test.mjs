import test from "node:test";
import assert from "node:assert/strict";
import { buildModelDraftNames, nextAnName, nextCampaignCjToken, replaceCjToken, shiftCjName } from "../campaign-manager.mjs";

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
