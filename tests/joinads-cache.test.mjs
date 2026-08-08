import test from "node:test";
import assert from "node:assert/strict";
import { retryJoinadsFetch } from "../functions/_joinads-cache.js";

test("repete falhas transitorias da JoinAds antes de declarar carga parcial", async () => {
  let calls = 0;
  const result = await retryJoinadsFetch(async () => {
    calls += 1;
    if (calls < 3) {
      const error = new Error("JoinAds temporariamente indisponivel");
      error.status = 502;
      throw error;
    }
    return { code: "success", data: [{ revenue: 10 }] };
  }, { attempts: 3, baseDelayMs: 0 });

  assert.equal(calls, 3);
  assert.equal(result.data[0].revenue, 10);
});

test("nao repete erro permanente de autorizacao da JoinAds", async () => {
  let calls = 0;
  await assert.rejects(() => retryJoinadsFetch(async () => {
    calls += 1;
    const error = new Error("Nao autorizado");
    error.status = 401;
    throw error;
  }, { attempts: 3, baseDelayMs: 0 }), /Nao autorizado/);

  assert.equal(calls, 1);
});
