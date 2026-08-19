import test from "node:test";
import assert from "node:assert/strict";
import { applyCreativePageOverride, applyCreativeTextOverrides, applyReplacementImageHash, collectCreativeImageHashes, creativeContainsImageHash, onRequest, resolveCreativeUrlTags } from "../functions/api/meta-ad-create.js";

test("substitui os textos do criativo sem alterar o modelo original", () => {
  const original = {
    page_id: "page-1",
    link_data: {
      message: "Texto antigo",
      name: "Titulo antigo",
      description: "Descricao antiga",
    },
  };
  const result = applyCreativeTextOverrides(original, null, {
    primary_text: "Texto novo",
    headline: "Titulo novo",
    description: "Descricao nova",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(result.unsupported, []);
  assert.equal(result.objectStorySpec.link_data.message, "Texto novo");
  assert.equal(result.objectStorySpec.link_data.name, "Titulo novo");
  assert.equal(result.objectStorySpec.link_data.description, "Descricao nova");
  assert.equal(original.link_data.message, "Texto antigo");
});

test("substitui textos em todos os ativos do asset feed preservando rotulos", () => {
  const result = applyCreativeTextOverrides(null, {
    bodies: [{ text: "Antigo 1", adlabels: [{ name: "body-1" }] }, { text: "Antigo 2" }],
    titles: [{ text: "Titulo antigo" }],
    descriptions: [{ text: "Descricao antiga" }],
  }, {
    primary_text: "Principal novo",
    headline: "Titulo novo",
    description: "Descricao nova",
  });
  assert.deepEqual(result.assetFeedSpec.bodies.map((item) => item.text), ["Principal novo", "Principal novo"]);
  assert.deepEqual(result.assetFeedSpec.bodies[0].adlabels, [{ name: "body-1" }]);
  assert.equal(result.assetFeedSpec.titles[0].text, "Titulo novo");
  assert.equal(result.assetFeedSpec.descriptions[0].text, "Descricao nova");
});

test("publica os textos editados no novo criativo", async () => {
  const originalFetch = globalThis.fetch;
  let adCreated = false;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/source-ad?")) {
      return Response.json({
        name: "Modelo",
        account_id: "123",
        creative: {
          actor_id: "page-1",
          object_story_id: "page-1_post-1",
          object_story_spec: {
            page_id: "page-1",
            link_data: {
              link: "https://example.com",
              image_hash: "hash-1",
              message: "Texto antigo",
              name: "Titulo antigo",
              description: "Descricao antiga",
            },
          },
        },
      });
    }
    if (target.endsWith("/act_123/adcreatives")) {
      assert.equal(options.body.has("object_story_id"), false);
      const sentSpec = JSON.parse(options.body.get("object_story_spec"));
      assert.equal(sentSpec.link_data.message, "Texto novo");
      assert.equal(sentSpec.link_data.name, "Titulo novo");
      assert.equal(sentSpec.link_data.description, "Descricao nova");
      return Response.json({ id: "creative-new" });
    }
    if (target.endsWith("/act_123/ads")) {
      adCreated = true;
      return Response.json({ id: "ad-new" });
    }
    return Response.json({}, { status: 404 });
  };

  try {
    const response = await onRequest({
      request: new Request("https://example.com/api/meta-ad-create", {
        method: "POST",
        body: JSON.stringify({
          ad_id: "source-ad",
          adset_id: "target-adset",
          primary_text: "Texto novo",
          headline: "Titulo novo",
          description: "Descricao nova",
        }),
      }),
      env: { META_ACCESS_TOKEN: "token" },
    });
    assert.equal(response.status, 200);
    assert.equal(adCreated, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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

test("substitui todos os blocos de imagem quando a Meta devolve um criativo misto", () => {
  const result = applyReplacementImageHash({
    link_data: { image_hash: "old-link" },
    photo_data: { image_hash: "old-photo", picture: "https://example.com/photo.jpg" },
    template_data: { image_url: "https://example.com/template.jpg" },
    video_data: { image_hash: "old-thumb" },
  }, null, "selected-hash");

  assert.equal(result.objectStorySpec.link_data.image_hash, "selected-hash");
  assert.equal(result.objectStorySpec.photo_data.image_hash, "selected-hash");
  assert.equal(result.objectStorySpec.template_data.image_hash, "selected-hash");
  assert.equal(result.objectStorySpec.video_data.image_hash, "selected-hash");
  assert.equal(result.objectStorySpec.photo_data.picture, undefined);
  assert.equal(result.objectStorySpec.template_data.image_url, undefined);
});

test("confirma apenas o hash efetivamente devolvido pela Meta", () => {
  const creative = {
    image_hash: "selected-hash",
    object_story_spec: { link_data: { image_hash: "selected-hash" } },
  };
  assert.equal(creativeContainsImageHash(creative, "selected-hash"), true);
  assert.equal(creativeContainsImageHash(creative, "another-hash"), false);
});

test("nao cria o anuncio quando a Meta salva uma imagem diferente da selecionada", async () => {
  const originalFetch = globalThis.fetch;
  let adCreationCalled = false;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/source-ad?")) {
      return Response.json({
        name: "Modelo",
        account_id: "123",
        creative: {
          actor_id: "page-1",
          object_story_spec: {
            page_id: "page-1",
            link_data: { link: "https://example.com", image_hash: "old-hash" },
          },
        },
      });
    }
    if (target.endsWith("/act_123/adcreatives")) {
      const sentSpec = JSON.parse(options.body.get("object_story_spec"));
      assert.equal(sentSpec.link_data.image_hash, "selected-hash");
      return Response.json({ id: "new-creative" });
    }
    if (target.includes("/new-creative?")) {
      return Response.json({ id: "new-creative", image_hash: "different-hash" });
    }
    if (target.endsWith("/act_123/ads")) adCreationCalled = true;
    return Response.json({ id: "unexpected" });
  };

  try {
    const response = await onRequest({
      request: new Request("https://example.com/api/meta-ad-create", {
        method: "POST",
        body: JSON.stringify({
          ad_id: "source-ad",
          adset_id: "target-adset",
          name: "Novo anuncio",
          replacement_image_hash: "selected-hash",
        }),
      }),
      env: { META_ACCESS_TOKEN: "token" },
    });
    const payload = await response.json();
    assert.equal(response.status, 409);
    assert.equal(payload.stage, "verify-creative-image");
    assert.equal(payload.expected_image_hash, "selected-hash");
    assert.equal(adCreationCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("preserva os parametros do criativo modelo quando nao ha sobrescrita", () => {
  assert.equal(
    resolveCreativeUrlTags({}, { url_tags: "utm_campaign={{campaign.id}}&utm_content={{ad.id}}" }),
    "utm_campaign={{campaign.id}}&utm_content={{ad.id}}"
  );
});

test("aplica os parametros enviados pelo Gerenciar e remove o ponto de interrogacao inicial", () => {
  assert.equal(
    resolveCreativeUrlTags(
      { utm_tags: "?utm_medium=paid_social&utm_campaign={{campaign.id}}" },
      { url_tags: "utm_medium=antigo" }
    ),
    "utm_medium=paid_social&utm_campaign={{campaign.id}}"
  );
  assert.equal(resolveCreativeUrlTags({ utm_tags: "" }, { url_tags: "utm_medium=antigo" }), "");
});

test("troca a Pagina do criativo e remove o Instagram antigo quando necessario", () => {
  const changed = applyCreativePageOverride({ page_id: "page-1", instagram_actor_id: "ig-old", link_data: { link: "https://example.com" } }, "page-2");
  assert.equal(changed.changed, true);
  assert.equal(changed.objectStorySpec.page_id, "page-2");
  assert.equal(changed.objectStorySpec.instagram_actor_id, undefined);
  assert.equal(applyCreativePageOverride(null, "page-2").unsupported, true);
});

test("repete a criacao sem Instagram quando a conta nao tem acesso", async () => {
  const originalFetch = globalThis.fetch;
  let creativeAttempts = 0;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/source-ad?")) {
      return Response.json({
        name: "Modelo",
        account_id: "123",
        creative: {
          actor_id: "page-1",
          instagram_actor_id: "ig-sem-acesso",
          object_story_spec: {
            page_id: "page-1",
            instagram_actor_id: "ig-sem-acesso",
            link_data: { link: "https://example.com", image_hash: "old-hash" },
          },
        },
      });
    }
    if (target.endsWith("/act_123/adcreatives")) {
      creativeAttempts += 1;
      const sentSpec = JSON.parse(options.body.get("object_story_spec"));
      if (creativeAttempts === 1) {
        assert.equal(sentSpec.instagram_actor_id, "ig-sem-acesso");
        return Response.json({
          error: { message: "Ad account does not have access to this Instagram account." },
        }, { status: 400 });
      }
      assert.equal(sentSpec.instagram_actor_id, undefined);
      assert.equal(sentSpec.link_data.image_hash, "selected-hash");
      return Response.json({ id: "new-creative" });
    }
    if (target.includes("/new-creative?")) {
      return Response.json({
        id: "new-creative",
        object_story_spec: { link_data: { image_hash: "selected-hash" } },
      });
    }
    if (target.endsWith("/act_123/ads")) return Response.json({ id: "new-ad" });
    return Response.json({}, { status: 404 });
  };

  try {
    const response = await onRequest({
      request: new Request("https://example.com/api/meta-ad-create", {
        method: "POST",
        body: JSON.stringify({
          ad_id: "source-ad",
          adset_id: "target-adset",
          name: "Novo anuncio",
          replacement_image_hash: "selected-hash",
        }),
      }),
      env: { META_ACCESS_TOKEN: "token" },
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.new_ad_id, "new-ad");
    assert.equal(payload.instagram_identity_removed, true);
    assert.equal(creativeAttempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
