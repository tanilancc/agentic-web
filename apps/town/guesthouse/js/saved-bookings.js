// Keeps bookings in the browser's storage, so a booking made in the partner desk's
// popup is still there for this site's own page. Every read and write is guarded: in a
// private window, or with storage blocked, the site still works from memory.

/**
 * Loads and saves bookings.
 */
export class SavedBookings {
  /**
   * The storage key. Change the version if the record shape changes.
   */
  static KEY = "town-guesthouse-bookings-v1";

  /**
   * The browser's localStorage, or null where there is none (Node, blocked storage).
   *
   * :return: The storage or null.
   */
  static defaultStorage() {
    try {
      return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
      return null;
    }
  }

  /**
   * Read the saved records.
   *
   * :param storage: A localStorage-like object, or null.
   * :return: The records, or [] when there are none or they cannot be read.
   */
  static load(storage) {
    if (!storage) {
      return [];
    }
    try {
      const saved = JSON.parse(storage.getItem(SavedBookings.KEY) || "[]");
      return Array.isArray(saved) ? saved.filter((record) => record && typeof record === "object" && typeof record.code === "string") : [];
    } catch {
      return [];
    }
  }

  /**
   * Save the records.
   *
   * :param storage: A localStorage-like object, or null.
   * :param records: The records to keep.
   */
  static save(storage, records) {
    if (!storage) {
      return;
    }
    try {
      storage.setItem(SavedBookings.KEY, JSON.stringify(records));
    } catch {
      // Storage is full or blocked: the change still holds in this page.
    }
  }

  /**
   * Put saved records into a list, replacing any with the same code.
   *
   * :param list: The list to change.
   * :param saved: The saved records.
   */
  static merge(list, saved) {
    for (const record of saved) {
      const index = list.findIndex((item) => item.code === record.code);
      if (index >= 0) {
        list[index] = record;
      } else {
        list.push(record);
      }
    }
  }
}
