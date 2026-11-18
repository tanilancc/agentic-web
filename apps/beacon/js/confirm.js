// An in-page question with two buttons, used before Beacon contacts a site the visitor
// did not type in themselves.

import { el } from "./dom.js";

/**
 * Ask a yes or no question in a dialog.
 *
 * :param doc: The document.
 * :param question: {title, message, accept, decline}, all shown as text.
 * :return: A Promise of true when the visitor accepts.
 */
export function ask(doc, { title, message, accept, decline }) {
  return new Promise((resolve) => {
    const yes = el(doc, "button", { className: "button", text: accept, attrs: { type: "button" } });
    const no = el(doc, "button", { className: "button button-quiet", text: decline, attrs: { type: "button" } });
    const heading = el(doc, "h2", { className: "ask-title", text: title, attrs: { tabindex: "-1" } });
    const dialog = el(doc, "dialog", { className: "ask" }, [
      heading,
      el(doc, "p", { className: "ask-message", text: message }),
      el(doc, "div", { className: "ask-buttons" }, [no, yes]),
    ]);
    const finish = (answer) => {
      dialog.close();
      dialog.remove();
      resolve(answer);
    };
    yes.addEventListener("click", () => finish(true));
    no.addEventListener("click", () => finish(false));
    // Escape closes a dialog: count it as "no".
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });
    doc.body.append(dialog);
    dialog.showModal();
    // Focus the heading, not a button, so a stray Enter answers nothing.
    heading.focus();
  });
}

/**
 * Ask before reading public files from an origin.
 *
 * :param doc: The document.
 * :param origin: The origin that would be contacted.
 * :return: A Promise of true when the visitor accepts.
 */
export function confirmContact(doc, origin) {
  return ask(doc, {
    title: "Inspect this site?",
    message: `Beacon will read public files from ${origin}. Continue?`,
    accept: "Inspect",
    decline: "Not now",
  });
}
