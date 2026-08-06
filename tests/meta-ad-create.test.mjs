import test from "node:test";
import assert from "node:assert/strict";
import { applyReplacementImageHash, collectCreativeImageHashes } from "../functions/api/meta-ad-create.js";

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

test("substitui imagens de carrossel e asset feed sem perder rotulos", () => {
  const result = applyReplacementImageHash(
    { link_data: { child_attachments: [{ image_hash: "old-1" }, { image_hash: "old-2" }] } },
    { images: [{ hash: "old-3", adlabels: [{ name: "feed" }] }] },
    "new-hash"
  );
  assert.deepEqual(
    result.objectStorySpec.link_data.child_attachments.map((item) => item.image_hash),
    ["new-hash", "new-hash"]
  );
  assert.equal(result.assetFeedSpec.images[0].hash, "new-hash");
  assert.deepEqual(result.assetFeedSpec.images[0].adlabels, [{ name: "feed" }]);
  assert.deepEqual(collectCreativeImageHashes({
    image_hash: "new-hash",
    asset_feed_spec: result.assetFeedSpec,
  }), ["new-hash"]);
});
