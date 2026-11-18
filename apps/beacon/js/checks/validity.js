// Validity checks: is the published network a well-formed agent graph?

import { Status, agentsOf, networkBlocker, outcome, skipped } from "./result.js";

export const validityChecks = [
  {
    id: "net.valid",
    group: "Network validity",
    spec: "§3.1",
    title: "The network passes the runtime's validation",
    must: true,
    run(snapshot) {
      const blocker = networkBlocker(snapshot);
      if (blocker || !snapshot.validation) {
        return skipped(blocker || "pub.network-file");
      }
      const errors = (snapshot.validation.errors || []).map(String);
      if (errors.length) {
        return outcome(Status.FAIL, errors.join(" "), "A runtime refuses to run a network with these errors. Fix them and publish again.");
      }
      return outcome(Status.PASS, `${agentsOf(snapshot.networkConfig).length} agent(s), no validation errors.`);
    },
  },
  {
    id: "net.front-agent",
    group: "Network validity",
    spec: "§2.1",
    title: "The manifest's front agent exists in the network",
    must: true,
    run(snapshot) {
      const blocker = networkBlocker(snapshot);
      if (blocker) {
        return skipped(blocker);
      }
      const front = snapshot.entry.front_man;
      const names = agentsOf(snapshot.networkConfig).map((agent) => agent.name);
      if (typeof front !== "string" || !names.includes(front)) {
        return outcome(Status.FAIL, `The manifest names the front agent '${String(front)}', which is not one of: ${names.join(", ") || "none"}.`,
          "Set front_man to the name of the network's entry agent.");
      }
      return outcome(Status.PASS, `Front agent '${front}'.`);
    },
  },
  {
    id: "net.descriptions",
    group: "Network validity",
    spec: "§2.1",
    title: "Every agent has a description",
    must: false,
    run(snapshot) {
      const blocker = networkBlocker(snapshot);
      if (blocker) {
        return skipped(blocker);
      }
      const missing = agentsOf(snapshot.networkConfig)
        .filter((agent) => typeof agent.function?.description !== "string" || !agent.function.description.trim())
        .map((agent) => agent.name);
      if (missing.length) {
        return outcome(Status.WARN, `No function.description: ${missing.join(", ")}.`,
          "A caller decides when to use an agent from its description. Add one to each.");
      }
      return outcome(Status.PASS, "Every agent has a description.");
    },
  },
  {
    id: "net.schemas",
    group: "Network validity",
    spec: "§2.1",
    title: "Every agent declares its inputs",
    must: false,
    run(snapshot) {
      const blocker = networkBlocker(snapshot);
      if (blocker) {
        return skipped(blocker);
      }
      const missing = agentsOf(snapshot.networkConfig)
        .filter((agent) => !agent.function?.parameters || typeof agent.function.parameters !== "object")
        .map((agent) => agent.name);
      if (missing.length) {
        return outcome(Status.WARN, `No function.parameters: ${missing.join(", ")}.`,
          "Give each callable agent a JSON Schema for its inputs.");
      }
      return outcome(Status.PASS, "Every agent declares its inputs.");
    },
  },
];
