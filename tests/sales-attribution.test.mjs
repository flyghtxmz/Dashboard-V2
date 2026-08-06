import test from "node:test";
import assert from "node:assert/strict";
import { buildDirectSalesCampaignRows } from "../sales-attribution.mjs";

const ad = (overrides = {}) => ({
  campaign_id: "cmp-1",
  campaign_name: "Campanha 1",
  ad_id: "ad-1",
  joinads_matched: false,
  ...overrides,
});

test("usa utm_campaign uma unica vez em campanha com varios anuncios", () => {
  const rows = buildDirectSalesCampaignRows({
    metaRows: [ad(), ad({ ad_id: "ad-2" })],
    campaignRows: [{
      domain: "site.test",
      custom_value: "cmp-1",
      impressions: 123,
      clicks: 14,
      revenue: 2,
      revenue_client: 1.58,
    }],
    domain: "site.test",
    brlRate: 5,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].impressions, 123);
  assert.equal(rows[0].revenue_client, 1.58);
  assert.equal(rows[0].revenue_client_brl, 7.9);
  assert.equal(rows[0].attribution_source, "utm_campaign_id");
  assert.equal(rows[0].active_view, null);
});

test("aceita UTM legada pelo nome da campanha", () => {
  const [row] = buildDirectSalesCampaignRows({
    metaRows: [ad()],
    campaignRows: [{ custom_value: "Campanha 1", impressions: 20, revenue_client: 0.5 }],
  });

  assert.equal(row.impressions, 20);
  assert.equal(row.attribution_source, "utm_campaign_name");
});

test("usa a atribuicao por anuncio quando nao existe total da campanha", () => {
  const [row] = buildDirectSalesCampaignRows({
    metaRows: [
      ad({ joinads_matched: true, data_level: "utm_content_ad_id", impressions_joinads: 10, clicks_joinads: 1, revenue_client_value: 0.4 }),
      ad({ ad_id: "ad-2", joinads_matched: true, data_level: "utm_content_ad_id", impressions_joinads: 15, clicks_joinads: 2, revenue_client_value: 0.6 }),
    ],
  });

  assert.equal(row.impressions, 25);
  assert.equal(row.revenue_client, 1);
  assert.equal(row.attribution_source, "ad_level");
});

test("nao deixa uma resposta vazia da campanha apagar dados por anuncio", () => {
  const [row] = buildDirectSalesCampaignRows({
    metaRows: [ad({ joinads_matched: true, data_level: "utm_content_ad_id", impressions_joinads: 9, revenue_client_value: 0.25 })],
    campaignRows: [{ custom_value: "cmp-1", impressions: 0, revenue_client: 0 }],
  });

  assert.equal(row.impressions, 9);
  assert.equal(row.revenue_client, 0.25);
  assert.equal(row.attribution_source, "ad_level");
});

test("usa key-value como fallback e respeita o dominio selecionado", () => {
  const [row] = buildDirectSalesCampaignRows({
    metaRows: [ad()],
    campaignRows: [{ domain: "outro.test", custom_value: "cmp-1", impressions: 999, revenue_client: 99 }],
    fallbackCampaignRows: [
      { domain: "outro.test", custom_value: "cmp-1", impressions: 500, earnings_client: 50 },
      { domain: "site.test", custom_value: "cmp-1", impressions: 30, earnings_client: 0.8 },
    ],
    domain: "site.test",
  });

  assert.equal(row.impressions, 30);
  assert.equal(row.revenue_client, 0.8);
  assert.equal(row.attribution_source, "key_value_campaign_id");
});
