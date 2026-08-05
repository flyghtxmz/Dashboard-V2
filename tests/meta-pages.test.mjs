import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchAllMetaPages,
  fetchBusinessMetaPages,
  fetchMetaPermissions,
  mergeMetaPages,
} from "../functions/api/meta-pages.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("percorre todas as paginas devolvidas pelo cursor da Meta", async () => {
  const urls = [];
  const responses = [
    jsonResponse({
      data: [{ id: "1", name: "Página A" }],
      paging: { next: "https://graph.facebook.com/v24.0/me/accounts?after=cursor" },
    }),
    jsonResponse({ data: [{ id: "2", name: "Página B" }] }),
  ];
  const result = await fetchAllMetaPages("https://graph.facebook.com/v24.0/me/accounts", async (url) => {
    urls.push(url);
    return responses.shift();
  });

  assert.equal(result.pagesFetched, 2);
  assert.deepEqual(result.rows.map((page) => page.id), ["1", "2"]);
  assert.equal(urls.length, 2);
});

test("nao segue cursor externo e evita SSRF", async () => {
  const result = await fetchAllMetaPages("https://graph.facebook.com/v24.0/me/accounts", async () =>
    jsonResponse({
      data: [{ id: "1", name: "Página" }],
      paging: { next: "https://example.com/roubo" },
    })
  );
  assert.equal(result.pagesFetched, 1);
  assert.equal(result.truncated, false);
});

test("une paginas gerenciadas e promoviveis sem expor access_token", () => {
  const pages = mergeMetaPages([
    { name: "gerenciada", rows: [{ id: "1", name: "Zulu", access_token: "segredo" }] },
    { name: "promovivel", rows: [
      { id: "1", name: "Zulu", category: "Saúde" },
      { id: "2", name: "Alfa" },
    ] },
  ]);

  assert.deepEqual(pages.map((page) => page.id), ["2", "1"]);
  assert.deepEqual(pages[1].sources, ["gerenciada", "promovivel"]);
  assert.equal("access_token" in pages[1], false);
});

test("descobre paginas proprias e de clientes nos portfolios empresariais", async () => {
  const result = await fetchBusinessMetaPages("token", async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/me/businesses")) {
      return jsonResponse({ data: [{ id: "b1", name: "Empresa Principal" }] });
    }
    if (path.endsWith("/b1/owned_pages")) {
      return jsonResponse({ data: [{ id: "3", name: "Carla" }] });
    }
    if (path.endsWith("/b1/client_pages")) {
      return jsonResponse({ data: [{ id: "4", name: "Pagina Cliente" }] });
    }
    return jsonResponse({ error: { message: "Rota inesperada" } }, 404);
  });

  assert.equal(result.businesses.length, 1);
  assert.equal(result.sources.length, 2);
  assert.equal(result.failures.length, 0);
  assert.deepEqual(
    mergeMetaPages(result.sources).map((page) => page.name),
    ["Carla", "Pagina Cliente"]
  );
  assert.match(result.sources[0].label, /Empresa Principal/);
});

test("mantem paginas encontradas quando uma fonte empresarial falha", async () => {
  const result = await fetchBusinessMetaPages("token", async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/me/businesses")) {
      return jsonResponse({ data: [{ id: "b1", name: "Empresa" }] });
    }
    if (path.endsWith("/b1/owned_pages")) {
      return jsonResponse({ data: [{ id: "3", name: "Carla" }] });
    }
    return jsonResponse({ error: { message: "Sem business_management" } }, 403);
  });

  assert.equal(result.sources.length, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].status, 403);
  assert.equal(result.sources[0].rows[0].name, "Carla");
});

test("lista o estado das permissoes usadas para descobrir paginas", async () => {
  const permissions = await fetchMetaPermissions("token", async () =>
    jsonResponse({
      data: [
        { permission: "pages_show_list", status: "granted" },
        { permission: "business_management", status: "declined" },
      ],
    })
  );

  assert.deepEqual(permissions, {
    pages_show_list: "granted",
    business_management: "declined",
  });
});
