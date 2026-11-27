// Hand-built snapshots for check tests, so no test of a check needs a fetch.

/**
 * A FileRead that was fetched and is readable from another origin.
 *
 * :param url: The file's URL.
 * :param text: The file's text.
 * :return: The FileRead.
 */
export function goodRead(url, text = "{}") {
  return {
    url, ok: true, status: 200, corsReadable: true, redirectedTo: "", text, error: "",
    framing: { xFrameOptions: "", contentSecurityPolicy: "" },
  };
}

/**
 * A snapshot of a small, correct two-agent site at https://site.example.
 *
 * :return: The snapshot. Tests change the parts they need.
 */
export function goodSnapshot() {
  const base = "https://site.example";
  const networkConfig = {
    llm_config: { model_name: "alibaba/qwen3.8-flash" },
    tools: [
      {
        name: "guide",
        function: { description: "Finds the right local service.", parameters: { type: "object", properties: { request: { type: "string" } } } },
        instructions: "Understand the request and delegate it. Never invent prices.",
        tools: ["lodging"],
      },
      {
        name: "lodging",
        function: { description: "Answers lodging questions.", parameters: { type: "object", properties: { request: { type: "string" } } } },
        instructions: "Use only grounded lodging information.",
        tools: [],
      },
    ],
  };
  const manifest = {
    brand: "Example Guide",
    networks: [{ name: "guide_net", front_man: "guide", hocon: "./guide_net.network.json" }],
    allowed_peers: [],
    peer_policy: { mode: "closed" },
  };
  return {
    input: `${base}/guide_net`, base, origin: base, networkName: "guide_net", urlError: "",
    files: {
      manifest: goodRead(`${base}/agent-manifest.json`, JSON.stringify(manifest)),
      network: goodRead(`${base}/guide_net.network.json`, JSON.stringify(networkConfig)),
      links: goodRead(`${base}/links.json`, '{"version":1,"networks":{}}'),
    },
    manifest, entry: manifest.networks[0], networkConfig,
    validation: { errors: [], warnings: [], externals: [], mcps: [] },
    networks: ["guide_net"],
  };
}

/**
 * Run one check from a list by its id.
 *
 * :param checks: A list of CheckDef.
 * :param id: The check's id.
 * :param snapshot: The snapshot to check.
 * :param env: The environment handed to the check.
 * :return: The check's outcome.
 */
export async function runCheck(checks, id, snapshot, env = {}) {
  const check = checks.find((item) => item.id === id);
  if (!check) {
    throw new Error(`No check named ${id}.`);
  }
  return check.run(snapshot, env);
}
