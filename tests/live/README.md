# Live model check

`run_live_model_check.mjs` drives the deployed sites with a real model, the way a visitor
would. It sends each scenario's messages and answers Allow on every consent card. It
confirms every dialog and every partner window. It then prints, for each turn, the reply,
the agents that ran, the tools they called, any calls to other sites, and any errors.

It is not part of CI. It needs a real key and spends tokens on it, and it books and
orders in the demo town (in its own browser only).

```bash
LIVE_KEY=gsk_... node tests/live/run_live_model_check.mjs concierge
```

- Scenarios: `beacon`, `concierge` and `quorum`; with none named, it runs all three.
- `LIVE_ROUTER`: the OpenAI-compatible API to use. The default is Groq.
- `LIVE_MODEL`: the model. The default is `openai/gpt-oss-120b`.
- `LIVE_PAUSE_MS`: how long to wait between turns.
- `LIVE_OUT`: where to write a JSON report.

Groq's free tier allows 8,000 tokens a minute, so leave about a minute between turns
(`LIVE_PAUSE_MS=65000`). A turn in which an agent delegates to a second agent can exceed
that limit on its own.
