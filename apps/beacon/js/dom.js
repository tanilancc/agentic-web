// A small helper for building elements. Text always goes in as text, never as markup:
// most of what Beacon shows comes from other people's sites.

/**
 * Create an element.
 *
 * :param doc: The document.
 * :param tag: The tag name.
 * :param options: {className, text, attrs}. attrs maps attribute names to values.
 * :param children: Child elements or strings to append.
 * :return: The element.
 */
export function el(doc, tag, { className = "", text = "", attrs = {} } = {}, children = []) {
  const node = doc.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text) {
    node.textContent = text;
  }
  for (const [name, value] of Object.entries(attrs)) {
    node.setAttribute(name, value);
  }
  if (children.length) {
    node.append(...children);
  }
  return node;
}

/**
 * The host of a URL, or the text itself when it is not a URL.
 *
 * :param value: A URL.
 * :return: The host.
 */
export function hostOf(value) {
  try {
    return new URL(value).host;
  } catch {
    return String(value);
  }
}
