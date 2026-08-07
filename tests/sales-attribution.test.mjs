import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDirectSalesCampaignRows,
  buildJoinadsAdAttributionIndex,
  buildMessageJoinadsSummary,
  hasJoinadsAttributionMatch,
} from "../sales-attribution.mjs";

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

test("separa mensagens src_ de vendas, organico e trafego sem classificacao", () => {
  const summary = buildMessageJoinadsSummary({
    campaignRows: [
      { domain: "site.com", custom_value: "src_a", impressions: 10, clicks: 2, revenue_client: 1 },
      { domain: "site.com", custom_value: "src_b", impressions: 5, clicks: 1, revenue_client: 0.5 },
      { domain: "site.com", custom_value: "120000001", impressions: 50, clicks: 4, revenue_client: 4 },
      { domain: "site.com", custom_value: "organic_1", impressions: 20, clicks: 3, revenue_client: 2 },
      { domain: "outro.com", custom_value: "src_c", impressions: 99, clicks: 9, revenue_client: 9 },
    ],
    domain: "site.com",
    brlRate: 5,
    spendBrl: 3,
  });

  assert.equal(summary.sources, 2);
  assert.equal(summary.impressions, 15);
  assert.equal(summary.clicks, 3);
  assert.equal(summary.revenueClient, 1.5);
  assert.equal(summary.revenueClientBrl, 7.5);
  assert.equal(summary.roas, 2.5);
});

test("nao usa src_ como fallback de uma campanha de vendas com nome igual", () => {
  const [row] = buildDirectSalesCampaignRows({
    metaRows: [ad({ campaign_id: "sales-1", campaign_name: "src_legado" })],
    campaignRows: [
      { domain: "site.com", custom_value: "src_legado", impressions: 100, revenue_client: 10 },
    ],
    domain: "site.com",
  });

  assert.equal(row.joinads_matched, false);
  assert.equal(row.revenue_client, 0);
});

test("mantem utm_term reconhecida mesmo quando existe utm_content sem correspondencia", () => {
  const matched = hasJoinadsAttributionMatch({
    resolvedAd: false,
    content: false,
    custom: false,
    campaign: false,
    term: true,
  });

  assert.equal(matched, true);
});

test("usa endpoint alternativo de utm_content sem somar a mesma receita entre fontes", () => {
  const index = buildJoinadsAdAttributionIndex({
    adIds: ["ad-1", "ad-2"],
    domain: "site.test",
    sources: [
      {
        dataLevel: "utm_content_super_filter",
        rows: [
          { domain: "site.test", custom_value: "organic", impressions: 100, revenue_client: 10 },
          { domain: "site.test", custom_value: "ad-1", impressions: 8, revenue_client: 0.4 },
        ],
      },
      {
        dataLevel: "utm_content_key_value_country",
        rows: [
          { name: "site.test", custom_value: "ad-1", impressions: 80, earnings_client: 4 },
          { name: "site.test", custom_value: "ad-2", impressions: 12, earnings_client: 0.6 },
        ],
      },
    ],
  });

  assert.equal(index.get("ad-1").impressions, 8);
  assert.equal(index.get("ad-1").revenue_client, 0.4);
  assert.equal(index.get("ad-1").data_level, "utm_content_super_filter");
  assert.equal(index.get("ad-2").impressions, 12);
  assert.equal(index.get("ad-2").revenue_client, 0.6);
  assert.equal(index.get("ad-2").data_level, "utm_content_key_value_country");
  assert.equal(index.has("organic"), false);
});

test("agrega linhas do mesmo endpoint antes de aplicar a prioridade", () => {
  const index = buildJoinadsAdAttributionIndex({
    adIds: ["120"],
    sources: [{
      dataLevel: "utm_content_key_value",
      rows: [
        { custom_value: "120", impressions: 3, earnings_client: 0.1 },
        { custon_value: "120", impressions: 4, earnings_client: 0.2 },
      ],
    }],
  });

  assert.equal(index.get("120").impressions, 7);
  assert.equal(index.get("120").revenue_client, 0.30000000000000004);
});
