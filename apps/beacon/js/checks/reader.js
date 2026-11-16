// Readers fetch one public file the way a calling site's browser would, and say whether
// that browser could read it. Checks never fetch by themselves: they read a snapshot.
//
// A FileRead is {url, ok, status, corsReadable, redirectedTo, text, error}:
//   ok            the file was fetched with a 2xx status and its text was read
//   corsReadable  a browser on another origin may read the response
//   redirectedTo  the final URL when it differs from url, else ""
//   error         a short reason when something went wrong, else ""

/**
 * The reason given for a file over the size limit. Fixed copy, whatever the limit.
 */
export const TOO_LARGE = "larger than 1 MB";

/**
 * Build an empty FileRead for a URL.
 *
 * :param url: The URL that was asked for.
 * :return: A FileRead with nothing read.
 */
function emptyRead(url) {
  return { url, ok: false, status: 0, corsReadable: false, redirectedTo: "", text: "", error: "" };
}

/**
 * Run a fetch with a time limit that holds even when the fetch ignores its signal.
 *
 * :param start: A function that takes an AbortSignal and returns the fetch's Promise.
 * :param timeoutMs: The limit in milliseconds.
 * :return: The fetch's result.
 * :raises Error: With the message "timed out" when the limit passes first.
 */
async function withTimeout(start, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const limit = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timed out"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([start(controller.signal), limit]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a response's text, refusing one over the size limit.
 *
 * :param response: The Response.
 * :param maxBytes: The size limit.
 * :return: The text, or null when the body is too large.
 */
async function limitedText(response, maxBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) {
    return null;
  }
  const text = await response.text();
  return text.length > maxBytes ? null : text;
}

/**
 * Reads files from Node, where fetch does not enforce CORS.
 *
 * It sends the caller's Origin and reads Access-Control-Allow-Origin itself. It follows
 * redirects by hand so the final URL is known.
 */
export class NodeReader {
  /**
   * The most redirects to follow for one file.
   */
  static MAX_REDIRECTS = 5;

  /**
   * :param callerOrigin: The Origin to send. The default stands for any other site.
   * :param fetchImpl: The fetch function to use.
   * :param timeoutMs: The time limit for one file, redirects included.
   * :param maxBytes: The largest body to read.
   */
  constructor({ callerOrigin = "https://caller.example", fetchImpl = fetch, timeoutMs = 10000, maxBytes = 1048576 } = {}) {
    this.callerOrigin = callerOrigin;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.maxBytes = maxBytes;
  }

  /**
   * Read one file.
   *
   * :param url: The file's URL.
   * :return: A FileRead. Never throws.
   */
  async read(url) {
    const read = emptyRead(url);
    try {
      return await withTimeout((signal) => this.follow(url, read, signal), this.timeoutMs);
    } catch (error) {
      read.error = error.message === "timed out" ? "timed out" : "unreachable";
      return read;
    }
  }

  /**
   * Fetch a URL, following redirects, and fill in the FileRead.
   *
   * :param url: The first URL.
   * :param read: The FileRead to fill in.
   * :param signal: The AbortSignal for the time limit.
   * :return: The FileRead.
   */
  async follow(url, read, signal) {
    let current = url;
    for (let hop = 0; hop <= NodeReader.MAX_REDIRECTS; hop += 1) {
      const response = await this.fetchImpl(current, {
        headers: { Origin: this.callerOrigin },
        redirect: "manual",
        signal,
      });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        current = new URL(location, current).href;
        continue;
      }
      read.status = response.status;
      read.redirectedTo = current === url ? "" : current;
      const allowed = response.headers.get("access-control-allow-origin");
      read.corsReadable = allowed === "*" || allowed === this.callerOrigin;
      if (!response.ok) {
        read.error = `HTTP ${response.status}`;
        return read;
      }
      const text = await limitedText(response, this.maxBytes);
      if (text === null) {
        read.error = TOO_LARGE;
        return read;
      }
      read.ok = true;
      read.text = text;
      return read;
    }
    read.error = "too many redirects";
    return read;
  }
}

/**
 * Reads files from a web page, where the browser enforces CORS for real.
 */
export class BrowserReader {
  /**
   * :param fetchImpl: The fetch function to use.
   * :param timeoutMs: The time limit for one file.
   * :param maxBytes: The largest body to read.
   */
  constructor({ fetchImpl = (...args) => fetch(...args), timeoutMs = 10000, maxBytes = 1048576 } = {}) {
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.maxBytes = maxBytes;
  }

  /**
   * Read one file.
   *
   * :param url: The file's URL.
   * :return: A FileRead. Never throws.
   */
  async read(url) {
    const read = emptyRead(url);
    let response;
    try {
      response = await withTimeout((signal) => this.fetchImpl(url, {
        mode: "cors", credentials: "omit", redirect: "follow", cache: "no-store", signal,
      }), this.timeoutMs);
    } catch (error) {
      if (error.message === "timed out") {
        read.error = "timed out";
        return read;
      }
      read.error = await this.reachable(url) ? "blocked by CORS" : "unreachable";
      return read;
    }
    read.status = response.status;
    read.corsReadable = true;
    read.redirectedTo = response.url && response.url !== url ? response.url : "";
    if (!response.ok) {
      read.error = `HTTP ${response.status}`;
      return read;
    }
    const text = await limitedText(response, this.maxBytes);
    if (text === null) {
      read.error = TOO_LARGE;
      return read;
    }
    read.ok = true;
    read.text = text;
    return read;
  }

  /**
   * Ask whether the server answers at all, with a request the browser never lets us read.
   *
   * :param url: The file's URL.
   * :return: True when an opaque response came back.
   */
  async reachable(url) {
    try {
      await withTimeout((signal) => this.fetchImpl(url, {
        mode: "no-cors", credentials: "omit", cache: "no-store", signal,
      }), this.timeoutMs);
      return true;
    } catch {
      return false;
    }
  }
}
