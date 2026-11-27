// The calling site's side of the town's partner desks.
//
// A partner site publishes partner-desk/action-bridge.html, which offers a few actions to
// callers it names. PartnerDesk asks the visitor before the first contact with each
// partner, checks every request against the partner's own schema, runs reads in a hidden
// frame and bookings in the partner's own window, and reports what happened honestly:
// a booking whose outcome is unknown is never retried.
//
// It imports nothing: the site passes in the runtime's ActionBridgeClient and validateData,
// so this one file works in any site and in tests.

/**
 * Run a promise with a time limit.
 *
 * :param promise: The promise.
 * :param ms: The limit.
 * :return: The result, or a rejection with the message "timed out".
 */
function withLimit(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error("timed out")), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * A request id for one execution.
 */
function requestId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Talks to partner sites' desks.
 */
export class PartnerDesk {
  /**
   * :param partners: [{id, label, origin, bridgeUrl}].
   * :param consent: (info) -> Promise of "allow", "always" or "decline": the runtime's consent card.
   * :param ClientClass: The runtime's ActionBridgeClient.
   * :param validate: The runtime's validateData(schema, value).
   * :param readTimeoutMs: The limit for a read, connecting included.
   * :param commitTimeoutMs: The limit for a booking once the partner's window is open.
   * :raises Error: When a partner's bridge is not on its own origin.
   */
  constructor({ partners, consent, ClientClass, validate, readTimeoutMs = 15000, commitTimeoutMs = 180000 }) {
    for (const partner of partners) {
      if (new URL(partner.bridgeUrl).origin !== new URL(partner.origin).origin) {
        throw new Error(`The partner desk of ${partner.id} is not on its origin ${partner.origin}.`);
      }
    }
    this.partners = new Map(partners.map((partner) => [partner.id, partner]));
    this.consent = consent;
    this.ClientClass = ClientClass;
    this.validate = validate;
    this.readTimeoutMs = readTimeoutMs;
    this.commitTimeoutMs = commitTimeoutMs;
    // Origins the visitor allowed in this page.
    this.allowed = new Set();
    // Partner id -> its catalog.
    this.catalogs = new Map();
  }

  /**
   * The partners, without their bridge URLs.
   *
   * :return: [{id, label, origin}].
   */
  list() {
    return [...this.partners.values()].map(({ id, label, origin }) => ({ id, label, origin }));
  }

  /**
   * Ask the visitor before the first contact with a partner's origin.
   *
   * :param partner: The partner.
   * :return: "" when allowed, or the reason it is not.
   */
  async ask(partner) {
    const host = new URL(partner.origin).host;
    if (this.allowed.has(partner.origin)) {
      return "";
    }
    const decision = await this.consent({
      kind: "network",
      peerLabel: partner.label,
      peerOrigin: host,
      requestText: `Check live availability and prices at ${partner.label}. Nothing is booked without your confirmation in its own window.`,
      est: { totalTokens: 0, costText: "no model call" },
    });
    if (decision === "decline") {
      return `The visitor declined to contact ${host}.`;
    }
    this.allowed.add(partner.origin);
    return "";
  }

  /**
   * The actions a partner offers this site.
   *
   * :param id: The partner id.
   * :return: The catalog, or {ok: false, reason}.
   */
  async catalog(id) {
    const partner = this.partners.get(id);
    if (!partner) {
      return { ok: false, reason: `No partner named ${id}.` };
    }
    const refused = await this.ask(partner);
    if (refused) {
      return { ok: false, reason: refused };
    }
    if (!this.catalogs.has(id)) {
      const client = new this.ClientClass(partner.bridgeUrl);
      try {
        const catalog = await withLimit((async () => { await client.connect(false); return client.request("catalog"); })(), this.readTimeoutMs);
        if (!Array.isArray(catalog)) {
          return { ok: false, reason: `${partner.label} sent no list of actions.` };
        }
        this.catalogs.set(id, catalog);
      } catch (error) {
        return { ok: false, unreachable: true, reason: error.message === "timed out" ? `${partner.label} did not answer in time.` : `${partner.label} could not be reached: ${error.message}` };
      } finally {
        client.dispose();
      }
    }
    return this.catalogs.get(id);
  }

  /**
   * Find an action and check the arguments before anything is sent.
   *
   * :param id: The partner id.
   * :param action: The action name.
   * :param args: The arguments.
   * :param wantRead: True for a read, false for a booking.
   * :return: {partner, entry} or {reason}.
   */
  async prepare(id, action, args, wantRead) {
    const catalog = await this.catalog(id);
    if (!Array.isArray(catalog)) {
      return { reason: catalog.reason, unreachable: !!catalog.unreachable };
    }
    const partner = this.partners.get(id);
    const entry = catalog.find((item) => item?.name === action);
    if (!entry) {
      return { reason: `${partner.label} does not offer ${action}.` };
    }
    if (wantRead && entry.effect !== "read") {
      return { reason: `${action} is not a read; it can only be booked.` };
    }
    if (!wantRead && entry.effect === "read") {
      return { reason: `${action} is a read, not a booking.` };
    }
    try {
      this.validate(entry.inputSchema, args);
    } catch (error) {
      return { reason: `Invalid request for ${action}: ${error.message}` };
    }
    return { partner, entry };
  }

  /**
   * Run one of a partner's reads, in a hidden frame.
   *
   * :param id: The partner id.
   * :param action: A read action from the partner's catalog.
   * :param args: Its arguments.
   * :return: The partner's answer, or {ok: false, reason}.
   */
  async read(id, action, args) {
    const ready = await this.prepare(id, action, args, true);
    if (ready.reason) {
      return { ok: false, reason: ready.reason, ...(ready.unreachable ? { unreachable: true } : {}) };
    }
    const client = new this.ClientClass(ready.partner.bridgeUrl);
    try {
      return await withLimit((async () => {
        await client.connect(false);
        return client.request("execute", { name: action, args, requestId: requestId() });
      })(), this.readTimeoutMs);
    } catch (error) {
      // A failure to reach the partner, not a refusal from it: the caller can stop asking.
      return { ok: false, unreachable: true, reason: error.message === "timed out" ? `${ready.partner.label} did not answer in time.` : `${ready.partner.label}: ${error.message}` };
    } finally {
      client.dispose();
    }
  }

  /**
   * Book with a partner, in the partner's own window, where the visitor confirms it.
   *
   * :param id: The partner id.
   * :param action: A booking action from the partner's catalog.
   * :param args: Its arguments, with the visitor's details.
   * :param signal: An AbortSignal. An abort closes the partner's window.
   * :return: {status: "booked", value} | {status: "refused" | "declined" | "unknown", reason}.
   */
  async commit(id, action, args, { signal } = {}) {
    const notSent = (reason) => ({ status: "declined", reason });
    if (signal?.aborted) {
      return notSent("The booking was stopped before anything was sent.");
    }
    const ready = await this.prepare(id, action, args, false);
    if (ready.reason) {
      return { status: "refused", reason: ready.reason };
    }
    const { partner } = ready;
    const client = new this.ClientClass(partner.bridgeUrl);
    // An abort closes the window and ends whatever is waiting.
    let onAbort;
    const aborted = new Promise((resolve, reject) => {
      onAbort = () => { client.dispose(); reject(new Error("aborted")); };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
    aborted.catch(() => {});
    try {
      try {
        // Opens the runtime's "Open action site" dialog, then the partner's window.
        await Promise.race([client.connect(true), aborted]);
      } catch (error) {
        return notSent(signal?.aborted ? "The booking was stopped before anything was sent."
          : `The window at ${partner.label} was not opened, so nothing was sent.`);
      }
      let value;
      try {
        let timer;
        const limit = new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error("timed out")), this.commitTimeoutMs); });
        try {
          value = await Promise.race([client.request("execute", { name: action, args, requestId: requestId() }), limit, aborted]);
        } finally {
          // Clear the limit however the booking ended, so no timer outlives it.
          clearTimeout(timer);
        }
      } catch (error) {
        if (/User declined; action not started/.test(error.message)) {
          return { status: "declined", reason: `The visitor did not confirm at ${partner.label}. Nothing was booked.` };
        }
        // The request was sent. It may or may not have been booked: never retry.
        return { status: "unknown", reason: `No answer from ${partner.label} after the request was sent, so it may have been booked. Check with ${partner.label} before trying again.` };
      }
      if (value && value.ok === true) {
        return { status: "booked", value };
      }
      return { status: "refused", reason: String(value?.reason || `${partner.label} refused the booking.`) };
    } finally {
      signal?.removeEventListener("abort", onAbort);
      client.dispose();
    }
  }
}

/**
 * Make a business's free text safe to hand to a model: remove the visitor's contact
 * details from it, and cut it short. The business has just received those details, and
 * its text becomes a tool result.
 *
 * :param text: The business's text.
 * :param card: The contact card's values.
 * :param max: The longest text kept.
 * :return: The cleaned text.
 */
export function cleanText(text, card, max) {
  let out = String(text ?? "");
  for (const value of Object.values(card || {})) {
    const secret = String(value ?? "").trim();
    if (secret.length >= 2) {
      out = out.split(new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")).join("[your details]");
    }
  }
  return out.slice(0, max);
}

/**
 * Turn PartnerDesk.commit's outcome into a result that is safe to show a model:
 * a booking needs a short plain reference, or it counts as unknown.
 *
 * :param outcome: The outcome of commit().
 * :param card: The contact card's values.
 * :return: {status, code} or {status, reason}.
 */
export function safeOutcome(outcome, card) {
  if (outcome.status === "booked") {
    const code = String(outcome.value?.code ?? "");
    if (/^[A-Za-z0-9-]{1,40}$/.test(code) && cleanText(code, card, 40) === code) {
      return { status: "booked", code };
    }
    return { status: "unknown", reason: "The business said yes but sent no usable reference, so it may have been booked. Check with the business before booking it again." };
  }
  return { status: outcome.status, reason: cleanText(outcome.reason, card, 300) };
}

