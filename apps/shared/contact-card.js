// The visitor's contact card. It is kept in this browser only. The assistant never sees
// it: book_trip reads it when booking and sends it to each business's own window, where
// the visitor sees it before confirming.

/**
 * The card's fields, in form order.
 */
export const CARD_FIELDS = ["firstName", "lastName", "email", "phone"];

/**
 * Find a form's input by its name.
 *
 * :param form: The form.
 * :param name: The input's name.
 * :return: The input, or null.
 */
export function field(form, name) {
  return [...(form?.querySelectorAll("input") || [])].find((input) => input.getAttribute("name") === name) ?? null;
}

/**
 * Loads, saves and edits the contact card.
 */
export class ContactCard {
  /**
   * The storage key.
   */
  static KEY = "concierge-contact-v1";

  /**
   * :param form: The card's form, with inputs named after CARD_FIELDS, or null.
   * :param storage: localStorage, or null where there is none.
   */
  constructor(form, storage) {
    this.form = form;
    this.storage = storage;
    this.values = ContactCard.load(storage);
    if (form) {
      for (const name of CARD_FIELDS) {
        const input = field(form, name);
        if (input) {
          input.value = this.values[name];
        }
      }
      form.addEventListener("input", () => this.read());
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this.read();
      });
    }
  }

  /**
   * Read the saved card.
   *
   * :param storage: localStorage, or null.
   * :return: The card, with every field as text.
   */
  static load(storage) {
    const empty = Object.fromEntries(CARD_FIELDS.map((name) => [name, ""]));
    try {
      const saved = JSON.parse(storage?.getItem(ContactCard.KEY) || "{}");
      for (const name of CARD_FIELDS) {
        if (typeof saved?.[name] === "string") {
          empty[name] = saved[name];
        }
      }
    } catch {
      // A card that cannot be read starts empty.
    }
    return empty;
  }

  /**
   * Take the form's values and save them.
   */
  read() {
    for (const name of CARD_FIELDS) {
      const input = field(this.form, name);
      if (input) {
        this.values[name] = String(input.value).trim().slice(0, 120);
      }
    }
    try {
      this.storage?.setItem(ContactCard.KEY, JSON.stringify(this.values));
    } catch {
      // Storage blocked: the card still holds for this visit.
    }
  }

  /**
   * The card as it is now.
   *
   * :return: A copy of the values.
   */
  card() {
    return { ...this.values };
  }
}
