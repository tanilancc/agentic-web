// A very small DOM for Beacon's view tests.
//
// It keeps a tree of elements and text, enough to check what a view shows. Setting
// innerHTML throws: Beacon's pages show text taken from other sites, which must never be
// parsed as markup, so a view that tries fails its test.

/**
 * One element or text node.
 */
export class MiniElement {
  /**
   * :param tag: The tag name in lower case, or "#text" for a text node.
   * :param text: The text of a text node.
   */
  constructor(tag, text = "") {
    this.tagName = tag;
    this.children = [];
    this.parent = null;
    this.text = text;
    this.attributes = {};
    this.listeners = {};
    this.dataset = {};
    this.style = {};
    this.className = "";
    this.id = "";
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.open = false;
    this.focused = 0;
  }

  get textContent() {
    return this.text + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    this.children = [];
    this.text = String(value);
  }

  set innerHTML(value) {
    throw new Error("innerHTML must not be used: text from other sites would be parsed as markup.");
  }

  /**
   * Add elements, or strings as text.
   */
  append(...nodes) {
    for (const node of nodes) {
      const child = typeof node === "string" ? new MiniElement("#text", node) : node;
      child.parent = this;
      this.children.push(child);
    }
  }

  appendChild(node) {
    this.append(node);
    return node;
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.text = "";
    this.append(...nodes);
  }

  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "id") {
      this.id = String(value);
    }
    if (name === "class") {
      this.className = String(value);
    }
  }

  getAttribute(name) {
    return name in this.attributes ? this.attributes[name] : null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  addEventListener(name, handler) {
    (this.listeners[name] ||= []).push(handler);
  }

  /**
   * Call an event's handlers and wait for them.
   *
   * :param name: The event name.
   * :param event: Extra event fields.
   */
  async dispatch(name, event = {}) {
    const full = { type: name, target: this, preventDefault() { full.defaultPrevented = true; }, ...event };
    for (const handler of this.listeners[name] || []) {
      await handler(full);
    }
    return full;
  }

  click() {
    return this.dispatch("click");
  }

  focus() {
    this.focused += 1;
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
  }

  get classList() {
    const element = this;
    const names = () => element.className.split(/\s+/).filter(Boolean);
    return {
      contains: (name) => names().includes(name),
      add: (name) => { if (!names().includes(name)) { element.className = [...names(), name].join(" "); } },
      remove: (name) => { element.className = names().filter((item) => item !== name).join(" "); },
      toggle: (name, on) => {
        const want = on === undefined ? !names().includes(name) : on;
        if (want) { this.classList.add(name); } else { this.classList.remove(name); }
      },
    };
  }

  /**
   * Whether the element matches a simple selector: tag, .class, #id or [attribute].
   */
  matches(selector) {
    if (selector.startsWith("#")) {
      return this.id === selector.slice(1);
    }
    if (selector.startsWith(".")) {
      return this.className.split(/\s+/).includes(selector.slice(1));
    }
    if (selector.startsWith("[")) {
      return selector.slice(1, -1) in this.attributes;
    }
    return this.tagName === selector;
  }

  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child.tagName !== "#text" && child.matches(selector)) {
          found.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return found;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  /**
   * Whether the element and all its ancestors are shown.
   */
  get visible() {
    for (let node = this; node; node = node.parent) {
      if (node.hidden) {
        return false;
      }
    }
    return true;
  }
}

/**
 * A document with a body.
 */
export class MiniDocument {
  constructor() {
    this.body = new MiniElement("body");
    this.title = "";
  }

  createElement(tag) {
    return new MiniElement(tag.toLowerCase());
  }

  createTextNode(text) {
    return new MiniElement("#text", String(text));
  }

  getElementById(id) {
    return this.body.querySelector(`#${id}`);
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }

  /**
   * Add an element with an id to the body, as the page's HTML would.
   *
   * :param tag: The tag name.
   * :param id: The element's id.
   * :return: The element.
   */
  add(tag, id) {
    const element = this.createElement(tag);
    element.id = id;
    this.body.append(element);
    return element;
  }
}
