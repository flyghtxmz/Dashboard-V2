import test from "node:test";
import assert from "node:assert/strict";
import { fetchAllMetaPages, mergeMetaPages } from "../functions/api/meta-pages.js";

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
