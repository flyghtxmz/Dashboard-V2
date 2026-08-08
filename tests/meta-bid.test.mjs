import test from "node:test";
import assert from "node:assert/strict";
import { onRequest as updateCampaignBid, resolveCampaignBidConfirmation } from "../functions/api/meta-campaign-bid.js";
import { onRequest as updateAdsetBid } from "../functions/api/meta-adset-bid.js";

test("aplica meta de custo CBO de forma atomica na campanha", async () => {
  const originalFetch = globalThis.fetch;
  let updateCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    const pathname = new URL(url).pathname;
    if (options.method === "POST") {
      updateCalls += 1;
      assert.equal(options.body.get("bid_strategy"), "COST_CAP");
      assert.deepEqual(JSON.parse(options.body.get("adset_bid_amounts")), { "set-1": 2500 });
      return Response.json({ success: true });
    }
    if (pathname.endsWith("/cmp-1")) {
      return Response.json({ id: "cmp-1", bid_strategy: "COST_CAP" });
    }
    if (pathname.endsWith("/set-1")) {
      return Response.json({ id: "set-1", bid_strategy: "COST_CAP", bid_amount: "2500" });
    }
    return Response.json({}, { status: 404 });
  };

  try {
    const response = await updateCampaignBid({
      request: new Request("https://dashboard.test/api/meta-campaign-bid", {
        method: "POST",
        body: JSON.stringify({
          campaign_id: "cmp-1",
          bid_strategy: "COST_CAP",
          adset_id: "set-1",
          bid_amount_brl: "25.00",
        }),
      }),
      env: { META_ACCESS_TOKEN: "token" },
    });
    assert.equal(response.status, 200);
    assert.equal(updateCalls, 1);
    const body = await response.json();
    assert.equal(body.strategy_applied, true);
    assert.equal(body.amount_applied, true);
    assert.equal(body.applied, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("confirma CBO pelo aceite da escrita quando a Meta omite a estrategia na leitura", () => {
  assert.deepEqual(resolveCampaignBidConfirmation({
    writeAccepted: true,
    strategyApplied: null,
    amountApplied: true,
    requiresAmount: true,
    requestedStrategy: "COST_CAP",
    actualStrategy: "",
  }), {
    applied: true,
    confirmedStrategy: "COST_CAP",
    source: "meta_write_ack",
  });

  assert.deepEqual(resolveCampaignBidConfirmation({
    writeAccepted: true,
    strategyApplied: false,
    amountApplied: true,
    requiresAmount: true,
    requestedStrategy: "COST_CAP",
    actualStrategy: "LOWEST_COST_WITH_BID_CAP",
  }), {
    applied: false,
    confirmedStrategy: "LOWEST_COST_WITH_BID_CAP",
    source: "meta_read",
  });
});

test("nao para no HTTP 200 quando a Meta ignora o primeiro formato da meta de custo", async () => {
  const originalFetch = globalThis.fetch;
  let postCalls = 0;
  let constraintApplied = false;
  globalThis.fetch = async (_url, options = {}) => {
    if (options.method === "POST") {
      postCalls += 1;
      if (postCalls === 1) {
        assert.equal(options.body.get("bid_amount"), "2000");
      } else {
        assert.deepEqual(JSON.parse(options.body.get("bid_constraints")), {
          cost_per_result_goal: 2000,
        });
        constraintApplied = true;
      }
      return Response.json({ success: true });
    }
    return constraintApplied
      ? Response.json({
          id: "set-1",
          bid_strategy: "COST_CAP",
          bid_constraints: { cost_per_result_goal: 2000 },
        })
      : Response.json({
          id: "set-1",
          bid_strategy: "LOWEST_COST_WITH_BID_CAP",
          bid_amount: 1000,
        });
  };

  try {
    const response = await updateAdsetBid({
      request: new Request("https://dashboard.test/api/meta-adset-bid", {
        method: "POST",
        body: JSON.stringify({
          adset_id: "set-1",
          bid_strategy: "COST_CAP",
          bid_amount_brl: "20.00",
        }),
      }),
      env: { META_ACCESS_TOKEN: "token" },
    });
    assert.equal(response.status, 200);
    assert.equal(postCalls, 2);
    const body = await response.json();
    assert.equal(body.applied, true);
    assert.equal(body.amount_applied, true);
    assert.equal(body.adset.bid_strategy, "COST_CAP");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
