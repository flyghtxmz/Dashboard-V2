import test from "node:test";
import assert from "node:assert/strict";
import { onRequest as updateCampaignBudget } from "../functions/api/meta-campaign-budget.js";
import { onRequest as updateAdsetBudget } from "../functions/api/meta-adset-budget.js";

test("atualiza orcamento vitalicio da campanha duplicada", async () => {
  const originalFetch = globalThis.fetch;
  let updateCalls = 0;
  globalThis.fetch = async (_url, options = {}) => {
    if (options.method === "POST") {
      updateCalls += 1;
      assert.equal(options.body.get("lifetime_budget"), "15050");
      assert.equal(options.body.get("daily_budget"), null);
      return Response.json({ success: true });
    }
    return Response.json({ lifetime_budget: "15050" });
  };

  try {
    const response = await updateCampaignBudget({
      request: new Request("https://dashboard.test/api/meta-campaign-budget", {
        method: "POST",
        body: JSON.stringify({ campaign_id: "cmp-2", budget_type: "lifetime", budget_brl: "150.50" }),
      }),
      env: { META_ACCESS_TOKEN: "token" },
    });
    assert.equal(response.status, 200);
    assert.equal(updateCalls, 1);
    const body = await response.json();
    assert.equal(body.budget_type, "lifetime");
    assert.equal(body.budget_brl, 150.5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mantem compatibilidade com atualizacao diaria do conjunto", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options = {}) => {
    if (options.method === "POST") {
      assert.equal(options.body.get("daily_budget"), "2990");
      assert.equal(options.body.get("lifetime_budget"), null);
      return Response.json({ success: true });
    }
    return Response.json({ daily_budget: "2990" });
  };

  try {
    const response = await updateAdsetBudget({
      request: new Request("https://dashboard.test/api/meta-adset-budget", {
        method: "POST",
        body: JSON.stringify({ adset_id: "set-2", daily_budget_brl: "29.90" }),
      }),
      env: { META_ACCESS_TOKEN: "token" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.budget_type, "daily");
    assert.equal(body.budget_brl, 29.9);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
