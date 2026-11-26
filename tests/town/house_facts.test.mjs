// When another site's assistant asks a town site a question, the town site's network runs
// without its own site's tools, so it cannot read its policies page. A small specialist
// holds the key rules instead, each quoted word for word from that page, so they cannot
// drift from what the business publishes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseHocon } from "../../skills/agentify-website/runtime/hocon.js";
import { AgentNetwork } from "../../skills/agentify-website/runtime/kernel.js";

const ROOT = new URL("../../", import.meta.url);
const SITES = [
  { dir: "apps/town/guesthouse", network: "tidewhistle_guesthouse", agent: "house_rules", must: [/Garden Room/, /pet-free/, /Check-in is from 3 pm/] },
  { dir: "apps/town/harbor_tours", network: "marrow_point_harbor_tours", agent: "tour_rules", must: [/Dogs on a lead/, /Seal Rocks Cruise/, /Adults are 16 and over/] },
];

const words = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

for (const site of SITES) {
  test(`${site.network}: the ${site.agent} facts are quoted from the policies page, and peers are sent to them`, () => {
    const config = parseHocon(readFileSync(new URL(`${site.dir}/${site.network}.network.json`, ROOT), "utf8"));
    const network = new AgentNetwork(config, site.network);
    const spec = network.getAgentSpec(site.agent);
    assert.ok(spec, `No ${site.agent} agent.`);
    const lines = spec.instructions.split("\n");
    const facts = lines.slice(lines.indexOf("Facts:") + 1).filter((line) => line.startsWith("- ")).map((line) => line.slice(2).trim());
    assert.ok(lines.includes("Facts:"), "No Facts: list.");
    assert.ok(facts.length >= 8, "Too few facts to answer common questions.");
    const policies = words(readFileSync(new URL(`${site.dir}/policies.html`, ROOT), "utf8"));
    for (const fact of facts) {
      assert.ok(policies.includes(fact), `Not on the policies page word for word: "${fact}"`);
    }
    for (const pattern of site.must) {
      assert.ok(facts.some((fact) => pattern.test(fact)), `No fact matches ${pattern}.`);
    }
    const front = network.getAgentSpec(network.findFrontMan());
    assert.ok(front.tools.includes(site.agent), `The front agent cannot call ${site.agent}.`);
    assert.match(front.instructions, new RegExp(`${site.agent} when you have no website_\\* tools`));
    assert.ok(front.instructions.length < 5000, `Front agent over 5000 characters (${front.instructions.length}).`);
  });
}
