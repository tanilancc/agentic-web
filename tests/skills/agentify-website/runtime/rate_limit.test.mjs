// A provider's rate limit (HTTP 429) makes the runtime wait the time the provider asks
// for and try again, up to twice, instead of ending the visitor's turn with raw JSON.
import assert from "node:assert/strict";
import test from "node:test";
import { LlmClient } from "../../../../skills/agentify-website/runtime/llm.js";
import { RateLimit } from "../../../../skills/agentify-website/runtime/rate-limit.js";
import { statusTextForEvent } from "../../../../skills/agentify-website/runtime/turn-status.js";
import { TraceBus } from "../../../../skills/agentify-website/runtime/trace.js";

const GROQ_429 = '{"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_x` on tokens per minute (TPM): Limit 8000, Used 5663, Requested 3438. Please try again in 8.2575s. Need more tokens?","type":"tokens"}}';

function sse(text) {
  const chunks = [
    { model: "m", choices: [{ delta: { content: text } }] },
    { model: "m", choices: [{ delta: {}, finish_reason: "stop" }] },
  ];
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const limited = (text = GROQ_429, headers = {}) => new Response(text, { status: 429, headers });

/**
 * Run chat() with fetch answering from a list, and record the waits instead of sleeping.
 */
async function chatWith(responses, { signal } = {}) {
  const calls = [];
  const waits = [];
  const original = globalThis.fetch;
  const originalSleep = RateLimit.sleep;
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return responses.shift();
  };
  RateLimit.sleep = async (ms, s) => {
    waits.push(ms);
    s?.throwIfAborted?.();
  };
  const trace = new TraceBus();
  try {
    const client = new LlmClient({ baseUrl: "https://api.groq.com/openai/v1", apiKey: "gsk_test", trace });
    const result = await client.chat({ model: "openai/gpt-oss-120b", messages: [{ role: "user", content: "hi" }], origin: "test", signal });
    return { result, calls, waits, trace };
  } catch (error) {
    return { error, calls, waits, trace };
  } finally {
    globalThis.fetch = original;
    RateLimit.sleep = originalSleep;
  }
}

test("the wait is read from Retry-After or from the provider's own words", () => {
  const h = (v) => new Headers(v ? { "retry-after": v } : {});
  assert.equal(RateLimit.waitMs(429, h("7"), ""), 7000);
  assert.equal(RateLimit.waitMs(429, h(), GROQ_429), 8258);
  assert.equal(RateLimit.waitMs(429, h(), "Please retry after 250ms"), 250);
  assert.equal(RateLimit.waitMs(429, h(), "try again in 1m26.4s"), 86400);
  assert.equal(RateLimit.waitMs(429, h(), "slow down"), RateLimit.DEFAULT_WAIT_MS, "A 429 with no hint waits a short default.");
  assert.equal(RateLimit.waitMs(500, h("7"), GROQ_429), null, "Only rate limits are retried.");
  assert.equal(RateLimit.waitMs(503, h("4"), ""), 4000, "A 503 that says when to come back is retried too.");
  assert.equal(RateLimit.waitMs(503, h(), ""), null);
});

test("a rate-limited call waits as asked and succeeds on the next try", async () => {
  const { result, calls, waits, trace } = await chatWith([limited(), sse("Hello")]);
  assert.equal(result.content, "Hello");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1], "The same request is sent again.");
  assert.deepEqual(waits, [8258]);
  const note = trace.events.find((e) => e.kind === "rate_limit_wait");
  assert.equal(note.waitMs, 8258);
  assert.equal(note.attempt, 1);
});

test("after two retries the visitor gets a plain sentence, not the provider's JSON", async () => {
  const { error, calls, waits } = await chatWith([limited(), limited(), limited()]);
  assert.equal(calls.length, 3);
  assert.equal(waits.length, 2);
  assert.equal(error.code, "LLM_RATE_LIMIT");
  assert.match(error.message, /rate limit/i);
  assert.match(error.message, /send your message again/i);
  assert.doesNotMatch(error.message, /\{|org_x|organization/, "No raw JSON or account details.");
});

test("a wait longer than the limit is not attempted", async () => {
  const { error, calls, waits } = await chatWith([limited("try again in 2m5s")]);
  assert.equal(calls.length, 1);
  assert.deepEqual(waits, []);
  assert.equal(error.code, "LLM_RATE_LIMIT");
  assert.match(error.message, /about 2 minutes/);
});

test("the visitor's Stop during a wait ends the call at once", async () => {
  const controller = new AbortController();
  controller.abort();
  const { error, calls } = await chatWith([limited(), sse("never")], { signal: controller.signal });
  assert.equal(calls.length, 1);
  assert.equal(error.name, "AbortError");
});

test("the turn status says the assistant is waiting for the provider", () => {
  assert.match(statusTextForEvent({ type: "provider.waiting", waitMs: 8258 }), /Waiting 9 s for your AI provider's rate limit/);
});
