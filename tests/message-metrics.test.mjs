import test from "node:test";
import assert from "node:assert/strict";
import { matchesMessageCampaignFilter, resolveMessageBudgetTarget, sortMessageCampaignRows } from "../message-metrics.mjs";

const rows = [
  { campaign_name: "Campanha 10", revenue_brl: 30, roas: null, margin_pct: -5, meta_impressions: 200, profit_per_conversation: null },
  { campaign_name: "Campanha 2", revenue_brl: 80, roas: 2.1, margin_pct: 25, meta_impressions: 900, profit_per_conversation: 18 },
  { campaign_name: "Campanha 1", revenue_brl: 50, roas: 1.2, margin_pct: 10, meta_impressions: 500, profit_per_conversation: 7 },
];

test("ordena metricas de mensagens do maior para o menor", () => {
  assert.deepEqual(
    sortMessageCampaignRows(rows, { key: "revenue_brl", direction: "desc" }).map((row) => row.campaign_name),
    ["Campanha 2", "Campanha 1", "Campanha 10"]
  );
});

test("inverte a ordenacao e mantem valores ausentes no final", () => {
  assert.deepEqual(
    sortMessageCampaignRows(rows, { key: "roas", direction: "asc" }).map((row) => row.campaign_name),
    ["Campanha 1", "Campanha 2", "Campanha 10"]
  );
});

test("usa receita BRL decrescente quando a coluna e invalida", () => {
  assert.deepEqual(
    sortMessageCampaignRows(rows, { key: "nao-existe", direction: "asc" }).map((row) => row.campaign_name),
    ["Campanha 2", "Campanha 1", "Campanha 10"]
  );
});

test("ordena campanha alfabeticamente com numeracao natural", () => {
  assert.deepEqual(
    sortMessageCampaignRows(rows, { key: "campaign_name", direction: "asc" }).map((row) => row.campaign_name),
    ["Campanha 1", "Campanha 2", "Campanha 10"]
  );
});

test("ordena as demais metricas agregadas da tabela", () => {
  assert.deepEqual(
    sortMessageCampaignRows(rows, { key: "meta_impressions", direction: "desc" }).map((row) => row.campaign_name),
    ["Campanha 2", "Campanha 1", "Campanha 10"]
  );
  assert.deepEqual(
    sortMessageCampaignRows(rows, { key: "profit_per_conversation", direction: "asc" }).map((row) => row.campaign_name),
    ["Campanha 1", "Campanha 2", "Campanha 10"]
  );
});

test("filtra mensagens por objetivo de vendas ou otimizacao de conversas", () => {
  const sales = { objective: "OUTCOME_SALES", adset_optimization_goal: "CONVERSATIONS" };
  const engagement = { objective: "OUTCOME_ENGAGEMENT", adset_optimization_goal: "CONVERSATIONS" };
  const leads = { objective: "OUTCOME_LEADS", adset_optimization_goal: "LEAD_GENERATION" };

  assert.equal(matchesMessageCampaignFilter(sales, "sales"), true);
  assert.equal(matchesMessageCampaignFilter(engagement, "sales"), false);
  assert.equal(matchesMessageCampaignFilter(sales, "conversations"), true);
  assert.equal(matchesMessageCampaignFilter(engagement, "conversations"), true);
  assert.equal(matchesMessageCampaignFilter(leads, "conversations"), false);
  assert.equal(matchesMessageCampaignFilter(leads, ""), true);
});

test("reconhece CBO mesmo quando a Meta devolve orcamento zero no conjunto", () => {
  assert.deepEqual(resolveMessageBudgetTarget({
    id: "set-1",
    campaignId: "cmp-1",
    dailyBudgetBrl: 0,
    lifetimeBudgetBrl: null,
    campaignDailyBudgetBrl: 50,
  }), { id: "cmp-1", scope: "campaign" });

  assert.deepEqual(resolveMessageBudgetTarget({
    id: "set-2",
    campaignId: "cmp-1",
    dailyBudgetBrl: 20,
    campaignDailyBudgetBrl: 0,
  }), { id: "set-2", scope: "adset" });
});
