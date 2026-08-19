import test from "node:test";
import assert from "node:assert/strict";
import { createSessionToken } from "../functions/_auth.js";
import { onRequest } from "../functions/api/message-refresh-snapshot.js";

function createReadOnlyDb(snapshot) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async run() { return { success: true }; },
            async first() {
              if (!String(sql).includes("SELECT current_payload")) return null;
              return {
                current_payload: JSON.stringify(snapshot),
                previous_payload: null,
                refresh_id: "refresh-anterior",
                updated_at: "2026-08-18T15:00:00.000Z",
              };
            },
          };
        },
        async run() { return { success: true }; },
      };
    },
  };
}

async function adminRequest(body, env) {
  const token = await createSessionToken({
    kind: "admin",
    username: "admin",
    email: env.AUTH_EMAIL,
    exp: Date.now() + 60_000,
  }, env);
  return new Request("https://example.com/api/message-refresh-snapshot", {
    method: "POST",
    headers: {
      Cookie: `__session=${encodeURIComponent(token)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("recupera a ultima referencia continua sem substituir por uma carga parcial", async () => {
  const previous = {
    savedAt: "2026-08-18T15:00:00.000Z",
    startDate: "2026-08-18",
    endDate: "2026-08-18",
    totals: { spend_brl: 100 },
    campaigns: { "cmp-1": { spend_brl: 100 } },
  };
  const env = {
    AUTH_EMAIL: "admin@example.com",
    AUTH_SECRET: "segredo-de-teste-com-tamanho-suficiente",
    DASHBOARD_DB: createReadOnlyDb(previous),
  };
  const request = await adminRequest({
    domain: "es.remediototal.com.br",
    account_id: "act_123",
    start_date: "2026-08-19",
    end_date: "2026-08-19",
    refresh_id: "refresh-parcial",
    variant: "message-refresh-v4",
    comparison_scope: "rolling-live-day-v1",
    preserve_current: true,
    snapshot: { totals: { spend_brl: 30 }, campaigns: { "cmp-1": { spend_brl: 30 } } },
  }, env);

  const response = await onRequest({ request, env });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.preserved, true);
  assert.deepEqual(payload.previous, previous);
  assert.equal(payload.refreshId, "refresh-anterior");
});

test("rejeita referencia continua para intervalo de varios dias", async () => {
  const env = {
    AUTH_EMAIL: "admin@example.com",
    AUTH_SECRET: "segredo-de-teste-com-tamanho-suficiente",
    DASHBOARD_DB: createReadOnlyDb(null),
  };
  const request = await adminRequest({
    domain: "es.remediototal.com.br",
    account_id: "act_123",
    start_date: "2026-08-18",
    end_date: "2026-08-19",
    refresh_id: "refresh-1",
    variant: "message-refresh-v4",
    comparison_scope: "rolling-live-day-v1",
    snapshot: { totals: {}, campaigns: {} },
  }, env);

  const response = await onRequest({ request, env });
  assert.equal(response.status, 400);
});
