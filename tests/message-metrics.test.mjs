import test from "node:test";
import assert from "node:assert/strict";
import { sortMessageCampaignRows } from "../message-metrics.mjs";

const rows = [
  { campaign_name: "Campanha 10", revenue_brl: 30, roas: null, margin_pct: -5 },
  { campaign_name: "Campanha 2", revenue_brl: 80, roas: 2.1, margin_pct: 25 },
  { campaign_name: "Campanha 1", revenue_brl: 50, roas: 1.2, margin_pct: 10 },
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
