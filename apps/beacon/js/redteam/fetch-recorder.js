// Records where a page's requests go during a red-team run. It notes the origin, method,
// path and whether an Authorization header was present. It never stores a header value,
// a query string or a body, so a recorded run holds no key and no message.

/**
 * Whether request headers carry Authorization, in any of the shapes fetch accepts.
 *
 * :param headers: A Headers object, a plain object, a list of pairs, or undefined.
 * :return: True when an Authorization header is present.
 */
function hasAuthorization(headers) {
  if (!headers) {
    return false;
  }
  if (typeof headers.has === "function") {
    return headers.has("authorization");
  }
  const names = Array.isArray(headers) ? headers.map((pair) => pair[0]) : Object.keys(headers);
  return names.some((name) => String(name).toLowerCase() === "authorization");
}

/**
 * Wraps a scope's fetch for the length of a run.
 */
export class FetchRecorder {
  /**
   * :param scope: The object whose fetch is wrapped, such as globalThis or window.
   */
  constructor(scope = globalThis) {
    this.scope = scope;
    this.records = [];
    this.original = null;
  }

  /**
   * Start recording. Every request still goes through unchanged.
   */
  install() {
    if (this.original) {
      return;
    }
    this.original = this.scope.fetch;
    const original = this.original;
    const records = this.records;
    this.scope.fetch = function recordedFetch(input, init = {}) {
      try {
        const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
        const fromRequest = typeof input === "object" && !(input instanceof URL) ? input : null;
        records.push({
          origin: url.origin,
          method: String(init.method || fromRequest?.method || "GET").toUpperCase(),
          path: url.pathname,
          hasAuthorization: hasAuthorization(init.headers) || hasAuthorization(fromRequest?.headers),
          at: Date.now(),
        });
      } catch {
        // A request the recorder cannot parse still goes out; fetch reports its own error.
      }
      return original.call(this, input, init);
    };
  }

  /**
   * Stop recording and put the original fetch back.
   */
  restore() {
    if (this.original) {
      this.scope.fetch = this.original;
      this.original = null;
    }
  }
}
