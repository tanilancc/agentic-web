// Models often write <br> inside Markdown table cells. The chat shows it as a line break,
// and still shows every other HTML tag as plain text.
import assert from "node:assert/strict";
import test from "node:test";

/**
 * A document just big enough for renderMarkdown.
 */
class FakeNode {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.classList = { add() {} };
    this.text = "";
  }
  set textContent(value) {
    this.children = [];
    this.text = value;
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = nodes;
  }
}

function flat(node) {
  if (node.tag === "#text") return [["#text", node.text]];
  return [[node.tag, node.text], ...node.children.flatMap(flat)];
}

globalThis.document = {
  createElement: (tag) => new FakeNode(tag),
  createTextNode: (text) => Object.assign(new FakeNode("#text"), { text }),
};
const { renderMarkdown } = await import("../../../../skills/agentify-website/runtime/cruse-render.js");

test("<br> in a table cell becomes a line break", () => {
  const root = new FakeNode("div");
  renderMarkdown(root, "| Vendor | Items |\n| --- | --- |\n| Green Fork | 2 × Falafel<br>4 × Quinoa<br/>1 × Wrap<BR /> |");
  const nodes = flat(root);
  assert.equal(nodes.filter(([tag]) => tag === "br").length, 3);
  assert.ok(!nodes.some(([, text]) => /<br/i.test(text || "")), "No literal <br> is left.");
  assert.ok(nodes.some(([tag, text]) => tag === "#text" && text === "4 × Quinoa"));
});

test("other HTML is still shown as text, never as markup", () => {
  const root = new FakeNode("div");
  renderMarkdown(root, "Hello <b>bold</b> <img src=x onerror=alert(1)> <br onclick=x>");
  const nodes = flat(root);
  assert.ok(!nodes.some(([tag]) => ["b", "img"].includes(tag)));
  assert.equal(nodes.filter(([tag]) => tag === "br").length, 0, "A <br> with attributes is not trusted.");
  assert.ok(nodes.some(([, text]) => (text || "").includes("<img src=x onerror=alert(1)>")));
});
