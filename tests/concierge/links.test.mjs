// The Town Concierge asks the guesthouse's own assistant a question, at the guesthouse's
// deployed address, in the real runtime. The sites are served from disk by a stub fetch,
// the router is scripted and the key is fake, so nothing leaves the process.
// Run from the repository root: node --test "tests/**/*.test.mjs"
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Engine } from "../../skills/agentify-website/runtime/engine.js";
import { MockRouter } from "../linking/chrome/mock_router.mjs";
import { ExampleWeb } from "../linking/example_web.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const KEY = "sk-test-not-a-real-key";
const ROUTER = "http://127.0.0.1:8791/v1";
const CONCIERGE = "https://oaw-concierge.pages.dev";
const GUESTHOUSE = "https://oaw-tidewhistle.pages.dev";
const TOURS = "https://oaw-harbor-tours.pages.dev";
const REQUEST = "Are dogs allowed at the guesthouse, and is there step-free access?";

async function setUp() {
  const router = new MockRouter(KEY, REQUEST, 1, 0);
  const web = new ExampleWeb(router, new URL(ROUTER).origin, KEY);
  web.serve(CONCIERGE, path.join(REPO, "apps/concierge"));
  web.serve(GUESTHOUSE, path.join(REPO, "apps/town/guesthouse"));
  web.serve(TOURS, path.join(REPO, "apps/town/harbor_tours"));
  // Node cannot import the Concierge's action module over HTTP; its own tests cover them.
  const manifest = JSON.parse(await readFile(path.join(REPO, "apps/concierge/agent-manifest.json"), "utf8"));
  delete manifest.actions;
  web.replace(`${CONCIERGE}/agent-manifest.json`, manifest);
  return { router, web };
}

async function run(setup, decision) {
  const cards = [];
  setup.web.install();
  try {
    const engine = new Engine({ originUrl: CONCIERGE, byokKey: KEY, routerOverride: ROUTER, modelOverride: "" });
    engine.onConsent = async (info) => {
      cards.push({ ...info, before: setup.web.requests.length });
      return decision;
    };
    const result = await engine.runTurn("Can we bring our dog to the guesthouse?");
    return { cards, result };
  } finally {
    setup.web.restore();
  }
}

test("the Concierge asks the guesthouse's assistant after one card, and the key goes only to the router", async () => {
  const setup = await setUp();
  const { cards, result } = await run(setup, "allow");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].peerLabel, "Tidewhistle Guesthouse");
  assert.equal(cards[0].peerOrigin, new URL(GUESTHOUSE).host);
  assert.equal(cards[0].requestText, REQUEST);
  const before = setup.web.requests.slice(0, cards[0].before).filter((r) => r.origin === GUESTHOUSE);
  assert.deepEqual(before, [], "The guesthouse was contacted before the visitor answered the card.");
  assert.deepEqual(setup.web.requestsTo(GUESTHOUSE, "runtime").map((r) => r.path), [
    "/agent-manifest.json", "/tidewhistle_guesthouse.network.json", "/links.json",
  ]);
  for (const record of setup.web.requests) {
    if (record.origin !== new URL(ROUTER).origin) {
      assert.equal(record.keySent, false, `${record.url} got the key.`);
    }
  }
  assert.deepEqual(setup.web.unexpected, []);
  const partner = setup.router.partnerChats();
  assert.ok(partner.length >= 1, "The guesthouse's assistant made no model call.");
  assert.equal(partner[0].peerRule, true);
  assert.match(result.text, /^CALLER_FINAL: PARTNER_ANSWER:/);
});

test("when the visitor declines the card, the guesthouse is never contacted", async () => {
  const setup = await setUp();
  const { cards } = await run(setup, "decline");
  assert.equal(cards.length, 1);
  assert.deepEqual(setup.web.requestsTo(GUESTHOUSE, null), []);
  assert.deepEqual(setup.router.partnerChats(), []);
});
