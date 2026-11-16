// Hygiene checks: things the spec does not forbid outright, plus one it does (secrets).

import { Status, agentsOf, networkBlocker, outcome, skipped } from "./result.js";

/**
 * Text shapes that look like credentials, by name.
 */
export const CREDENTIAL_PATTERNS = {
  "openai-style": /\bsk-[A-Za-z0-9_-]{20,}/,
  otari: /\botk_[A-Za-z0-9_-]{16,}/,
  aws: /\bAKIA[0-9A-Z]{16}\b/,
  github: /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  bearer: /\bBearer\s+[A-Za-z0-9._-]{20,}/,
};

/**
 * The instruction budget build_network.mjs warns above.
 */
export const MAX_INSTRUCTIONS = 5000;

const FABRICATE = /\b(invent|make up|fabricate|simulate (a|the) (result|response))\b/i;
const PROHIBITION = /\b(never|do not|don't|must not)\b/i;

/**
 * Find the first sentence that tells an agent to make something up.
 *
 * A sentence that says never to do it is fine: the prohibition must come before the verb
 * in the same sentence.
 *
 * :param text: An agent's instructions.
 * :return: The sentence, trimmed, or "".
 */
function fabricationSentence(text) {
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    const match = FABRICATE.exec(sentence);
    if (match && !PROHIBITION.test(sentence.slice(0, match.index))) {
      return sentence.trim().slice(0, 160);
    }
  }
  return "";
}

export const hygieneChecks = [
  {
    id: "hyg.secrets",
    group: "Hygiene",
    spec: "§4",
    title: "No credentials in public files",
    must: true,
    run(snapshot) {
      if (snapshot.urlError) {
        return skipped("pub.url");
      }
      const reads = Object.values(snapshot.files).filter((read) => read && read.text);
      if (!reads.length) {
        return skipped("pub.manifest");
      }
      const found = [];
      for (const read of reads) {
        for (const [name, pattern] of Object.entries(CREDENTIAL_PATTERNS)) {
          const match = pattern.exec(read.text);
          if (match) {
            // Show only enough to find it. The rest of the value is never repeated.
            found.push(`${read.url}: ${name} pattern starting "${match[0].slice(0, 6)}…"`);
          }
        }
      }
      if (found.length) {
        return outcome(Status.FAIL, `${found.join("; ")}.`,
          "Published files are public. Remove the value, publish again, and revoke the credential.");
      }
      return outcome(Status.PASS, `No credential-shaped text in ${reads.length} public file(s).`);
    },
  },
  {
    id: "hyg.instruction-size",
    group: "Hygiene",
    spec: "n/a",
    title: "Instructions fit a small model",
    must: false,
    run(snapshot) {
      const blocker = networkBlocker(snapshot);
      if (blocker) {
        return skipped(blocker);
      }
      const long = agentsOf(snapshot.networkConfig)
        .filter((agent) => typeof agent.instructions === "string" && agent.instructions.length > MAX_INSTRUCTIONS)
        .map((agent) => `${agent.name} (${agent.instructions.length} characters)`);
      if (long.length) {
        return outcome(Status.WARN, `Over ${MAX_INSTRUCTIONS} characters: ${long.join(", ")}.`,
          "Every model call sends the instructions, on the visitor's key. Shorten them.");
      }
      return outcome(Status.PASS, `No agent's instructions exceed ${MAX_INSTRUCTIONS} characters.`);
    },
  },
  {
    id: "hyg.demo-mode",
    group: "Hygiene",
    spec: "n/a",
    title: "Agents are not told to make things up",
    must: false,
    run(snapshot) {
      const blocker = networkBlocker(snapshot);
      if (blocker) {
        return skipped(blocker);
      }
      const agents = agentsOf(snapshot.networkConfig);
      if (snapshot.networkConfig.demo_mode || agents.some((agent) => agent.demo_mode)) {
        return outcome(Status.WARN, "The network sets demo_mode.", "Remove demo_mode so agents answer only from real data.");
      }
      for (const agent of agents) {
        const sentence = typeof agent.instructions === "string" ? fabricationSentence(agent.instructions) : "";
        if (sentence) {
          return outcome(Status.WARN, `${agent.name}: "${sentence}"`,
            "Tell the agent to answer only from tool results and to say when something is unavailable.");
        }
      }
      return outcome(Status.PASS, "No instruction tells an agent to invent results.");
    },
  },
  {
    id: "hyg.default-model",
    group: "Hygiene",
    spec: "§2.1",
    title: "The network names a model",
    must: false,
    run(snapshot) {
      const blocker = networkBlocker(snapshot);
      if (blocker) {
        return skipped(blocker);
      }
      const named = (config) => typeof config?.llm_config?.model_name === "string" && config.llm_config.model_name.trim() !== "";
      if (named(snapshot.networkConfig)) {
        return outcome(Status.PASS, `Model hint: ${snapshot.networkConfig.llm_config.model_name}.`);
      }
      const unnamed = agentsOf(snapshot.networkConfig)
        .filter((agent) => typeof agent.instructions === "string" && !named(agent))
        .map((agent) => agent.name);
      if (unnamed.length) {
        return outcome(Status.WARN, `No model named for: ${unnamed.join(", ")}.`,
          "Name a small, widely available model. A caller whose visitor picked none runs the network on its own model.");
      }
      return outcome(Status.PASS, "Every agent names a model.");
    },
  },
];
