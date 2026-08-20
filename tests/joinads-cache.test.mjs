import test from "node:test";
import assert from "node:assert/strict";
import { fetchJoinadsDailyCached, retryJoinadsFetch } from "../functions/_joinads-cache.js";

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date()).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

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

test("entrega a API ao vivo mesmo quando a gravacao no D1 falha", async () => {
  let apiCalls = 0;
  let readCalls = 0;
  const failingDb = {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              readCalls += 1;
              throw new Error("D1 read unavailable");
            },
            async run() {
              throw new Error(`D1 write unavailable: ${sql}`);
            },
          };
        },
      };
    },
  };
  const day = todayInSaoPaulo();
  const result = await fetchJoinadsDailyCached({
    env: { DASHBOARD_DB: failingDb },
    reportName: "earnings",
    startDate: day,
    endDate: day,
    identity: { domain: "es.remediototal.com.br" },
    fetchDay: async () => {
      apiCalls += 1;
      return { code: "success", data: [{ domain: "es.remediototal.com.br", revenue_client: 35.21 }] };
    },
  });

  assert.equal(apiCalls, 1);
  assert.equal(readCalls, 0, "o dia atual nao deve depender de leitura previa do cache");
  assert.equal(result.results[0].data[0].revenue_client, 35.21);
  assert.deepEqual(result.diagnostics.apiDays, [day]);
  assert.equal(result.diagnostics.storageHealthy, false);
  assert.equal(result.diagnostics.storageFailures[0].operation, "write");
  assert.equal(result.diagnostics.dayAudit[0].cacheSaved, false);
});

test("consulta a JoinAds quando a leitura historica do D1 falha", async () => {
  const failingDb = {
    prepare() {
      return {
        bind() {
          return {
            async first() { throw new Error("D1 internal error 7500"); },
            async run() { throw new Error("D1 internal error 7500"); },
          };
        },
      };
    },
  };
  const result = await fetchJoinadsDailyCached({
    env: { DASHBOARD_DB: failingDb },
    reportName: "super-filter",
    startDate: "2020-01-01",
    endDate: "2020-01-01",
    identity: { custom_key: "utm_campaign" },
    fetchDay: async () => ({ code: "success", data: [{ custom_value: "src_1", revenue_client: 2 }] }),
  });

  assert.equal(result.results[0].data[0].custom_value, "src_1");
  assert.deepEqual(result.diagnostics.apiDays, ["2020-01-01"]);
  assert.equal(result.diagnostics.storageHealthy, false);
  assert.deepEqual(
    result.diagnostics.storageFailures.map((item) => item.operation),
    ["read", "write"]
  );
});

test("nao deixa uma gravacao D1 travada atrasar indefinidamente a resposta ao vivo", async () => {
  const hangingDb = {
    prepare() {
      return {
        bind() {
          return {
            async first() { return null; },
            async run() { return new Promise(() => {}); },
          };
        },
      };
    },
  };
  const day = todayInSaoPaulo();
  const startedAt = Date.now();
  const result = await fetchJoinadsDailyCached({
    env: { DASHBOARD_DB: hangingDb, JOINADS_CACHE_OPERATION_TIMEOUT_MS: 100 },
    reportName: "earnings",
    startDate: day,
    endDate: day,
    identity: { domain: "es.remediototal.com.br" },
    fetchDay: async () => ({ code: "success", data: [{ revenue_client: 10 }] }),
  });

  assert.equal(result.results[0].data[0].revenue_client, 10);
  assert.equal(result.diagnostics.storageFailures[0].operation, "write");
  assert.match(result.diagnostics.storageFailures[0].message, /excedeu 100ms/);
  assert.ok(Date.now() - startedAt < 1000);
});
