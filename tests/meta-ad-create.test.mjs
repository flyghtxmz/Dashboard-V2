import test from "node:test";
import assert from "node:assert/strict";
import { applyReplacementImageHash } from "../functions/api/meta-ad-create.js";

test("troca a imagem do criativo modelo sem alterar o objeto original", () => {
  const original = {
    page_id: "page-1",
    link_data: {
      link: "https://example.com",
      image_hash: "old-hash",
      picture: "https://example.com/old.jpg",
    },
  };
  const result = applyReplacementImageHash(original, null, "new-hash");
  assert.equal(result.changed, true);
  assert.equal(result.objectStorySpec.link_data.image_hash, "new-hash");
  assert.equal(result.objectStorySpec.link_data.picture, undefined);
  assert.equal(original.link_data.image_hash, "old-hash");
});

test("informa quando o anuncio publicado nao permite substituir imagem", () => {
  const result = applyReplacementImageHash(null, null, "new-hash");
  assert.equal(result.changed, false);
});
