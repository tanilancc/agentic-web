// A model router for red-team tests. Each chat request is answered by a function the
// test supplies, so a test can make the caller's model obey a hostile peer and check
// that Beacon notices. The router never stores the key, only whether it was sent.

/**
 * Answers chat requests from a script function, in the streamed format the runtime reads.
 */
export class ScriptRouter {
  /**
   * :param key: The fake key the page should send.
   * :param reply: A function (request) -> {text} or {tool, arguments}. request is
   *     {system, messages, tools, role}, where role is "canary" when the system prompt is
   *     Beacon's canary desk, "auditor" for Beacon's auditor, and "peer" otherwise.
   */
  constructor(key, reply) {
    this.key = key;
    this.reply = reply;
    this.records = [];
  }

  /**
   * Answer one HTTP request, as ExampleWeb expects.
   *
   * :param method: The HTTP method.
   * :param path: The URL path.
   * :param headers: The request headers, lower-cased.
   * :param body: The request body text.
   * :return: {status, type, body}.
   */
  respond(method, path, headers, body) {
    const record = { method, path, keyOk: headers.authorization === `Bearer ${this.key}` };
    this.records.push(record);
    if (method !== "POST" || !path.endsWith("/chat/completions")) {
      return { status: 404, type: "text/plain", body: "Not found" };
    }
    const parsed = JSON.parse(body);
    const system = String(parsed.messages?.[0]?.content ?? "");
    const role = system.includes("Beacon canary desk") ? "canary"
      : system.includes("Beacon instruction auditor") ? "auditor" : "peer";
    const request = { system, messages: parsed.messages || [], tools: (parsed.tools || []).map((tool) => tool.function?.name), role };
    record.role = role;
    let answer;
    try {
      answer = this.reply(request);
    } catch (error) {
      return { status: 500, type: "text/plain", body: String(error.message || error) };
    }
    if (answer?.status) {
      return { status: answer.status, type: "text/plain", body: answer.body || "error" };
    }
    return { status: 200, type: "text/event-stream", body: ScriptRouter.stream(answer) };
  }

  /**
   * Whether a request already holds a tool result, so a script can answer after a call.
   *
   * :param request: The request given to the reply function.
   * :return: True when a tool message is present.
   */
  static hasToolResult(request) {
    return request.messages.some((message) => message.role === "tool");
  }

  /**
   * The text of the last tool result in a request.
   *
   * :param request: The request given to the reply function.
   * :return: The content, or "".
   */
  static lastToolResult(request) {
    const tools = request.messages.filter((message) => message.role === "tool");
    return tools.length ? String(tools.at(-1).content) : "";
  }

  /**
   * Build a server-sent event stream for one reply.
   *
   * :param answer: {text} or {tool, arguments}.
   * :return: The stream text.
   */
  static stream(answer) {
    const chunk = (delta, finish) => `data: ${JSON.stringify({ model: "script-1", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    if (answer?.tool) {
      return chunk({ tool_calls: [{ index: 0, id: `call_${Math.random().toString(16).slice(2, 10)}`, type: "function",
        function: { name: answer.tool, arguments: JSON.stringify(answer.arguments || {}) } }] }, null)
        + chunk({}, "tool_calls") + "data: [DONE]\n\n";
    }
    return chunk({ content: String(answer?.text ?? "") }, null) + chunk({}, "stop") + "data: [DONE]\n\n";
  }
}
