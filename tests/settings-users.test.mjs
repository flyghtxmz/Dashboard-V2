import test from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, getSession } from "../functions/_auth.js";
import { normalizeSettings, normalizeUserRole } from "../functions/_settings.js";
import { sanitizeUsers } from "../functions/api/settings.js";

const STORED_PASSWORD = {
  passwordHash: "hash",
  passwordSalt: "salt",
  passwordAlgo: "pbkdf2-sha256",
  passwordIterations: 100000,
};

test("preserva o papel de administrador nas configuracoes", () => {
  assert.equal(normalizeUserRole("admin"), "admin");
  assert.equal(normalizeUserRole("editor"), "editor");
  assert.equal(normalizeUserRole("desconhecido"), "gestor");
  assert.equal(normalizeSettings({ users: [{ username: "Admin2", role: "admin" }] }).users[0].role, "admin");
});

test("administrador adicional nao depende de dominio ou comissao", async () => {
  const previous = [{
    id: "user-admin",
    nome: "Admin adicional",
    username: "admin2",
    role: "admin",
    allowedDomains: [],
    commissionPercent: 0,
    ...STORED_PASSWORD,
  }];
  const users = await sanitizeUsers(previous, previous, new Set(["example.com"]));
  assert.equal(users[0].role, "admin");
  assert.deepEqual(users[0].allowedDomains, []);
  assert.equal(users[0].commissionPercent, 0);
});

test("sessao de administrador adicional continua vinculada ao usuario ativo", async () => {
  const user = {
    id: "user-admin",
    nome: "Admin adicional",
    username: "admin2",
    role: "admin",
    active: true,
    allowedDomains: [],
    commissionPercent: 0,
    ...STORED_PASSWORD,
  };
  const env = {
    AUTH_SECRET: "test-secret",
    CPA_RULES_KV: {
      get: async () => JSON.stringify({ domains: ["example.com"], users: [user] }),
    },
  };
  const token = await createSessionToken({
    kind: "user",
    role: "admin",
    username: user.username,
    userId: user.id,
    exp: Date.now() + 60_000,
  }, env);
  const request = new Request("https://dashboard.example.com/api/settings", {
    headers: { Cookie: `__session=${encodeURIComponent(token)}` },
  });
  const session = await getSession(request, env);
  assert.equal(session.kind, "user");
  assert.equal(session.id, user.id);
  assert.equal(session.role, "admin");
  assert.deepEqual(session.allowedDomains, ["*"]);

  user.active = false;
  assert.equal(await getSession(request, env), null);
});
