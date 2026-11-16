// A stand-in web for Beacon's tests: site folders and single files served through a fetch
// function, with the response headers, redirects and failures each test needs.

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Serves folders and fixed responses by URL, and records every request.
 */
export class FakeWeb {
  constructor() {
    // Origin -> {folder, cors}.
    this.sites = new Map();
    // URL -> {status, body, headers} or a function returning a Response or a Promise.
    this.fixed = new Map();
    // One entry per request: {url, origin, method, headers}.
    this.requests = [];
  }

  /**
   * Serve a folder under an origin.
   *
   * :param origin: The origin, such as "https://site.example".
   * :param folder: The folder to serve.
   * :param cors: Whether responses carry Access-Control-Allow-Origin: *.
   */
  serve(origin, folder, { cors = true } = {}) {
    this.sites.set(origin, { folder: path.resolve(folder), cors });
  }

  /**
   * Serve a fixed response at one URL, ahead of any folder.
   *
   * :param url: The full URL.
   * :param response: {status, body, headers}, or a function that returns a Response or a Promise.
   */
  put(url, response) {
    this.fixed.set(new URL(url).href, response);
  }

  /**
   * The requests sent to one origin.
   *
   * :param origin: The origin.
   * :return: The matching request records.
   */
  requestsTo(origin) {
    return this.requests.filter((request) => request.origin === origin);
  }

  /**
   * The fetch function to hand to the code under test.
   *
   * :return: A function with fetch's signature.
   */
  get fetch() {
    return async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      const headers = {};
      for (const [name, value] of Object.entries(init.headers || {})) {
        headers[name.toLowerCase()] = value;
      }
      this.requests.push({ url: url.href, origin: url.origin, method: init.method || "GET", headers });
      const fixed = this.fixed.get(url.href);
      if (typeof fixed === "function") {
        return fixed(url, init);
      }
      if (fixed) {
        const body = typeof fixed.body === "string" ? fixed.body : JSON.stringify(fixed.body ?? "");
        return FakeWeb.respond(fixed.status || 200, body, fixed.headers || {}, url.href);
      }
      const site = this.sites.get(url.origin);
      if (!site) {
        throw new TypeError("fetch failed");
      }
      const file = path.join(site.folder, decodeURIComponent(url.pathname));
      if (!file.startsWith(site.folder) || !existsSync(file) || !statSync(file).isFile()) {
        return FakeWeb.respond(404, "Not found", site.cors ? { "access-control-allow-origin": "*" } : {}, url.href);
      }
      const type = file.endsWith(".json") ? "application/json" : file.endsWith(".html") ? "text/html" : "text/plain";
      const responseHeaders = { "content-type": type };
      if (site.cors) {
        responseHeaders["access-control-allow-origin"] = "*";
      }
      return FakeWeb.respond(200, readFileSync(file, "utf8"), responseHeaders, url.href);
    };
  }

  /**
   * Build a Response whose url is set, as a real fetch does.
   *
   * :param status: The HTTP status.
   * :param body: The body text.
   * :param headers: The response headers.
   * :param url: The URL the response came from.
   * :return: The Response.
   */
  static respond(status, body, headers, url) {
    const nullBody = status === 204 || status === 304 || (status >= 300 && status < 400);
    const response = new Response(nullBody ? null : body, { status, headers });
    Object.defineProperty(response, "url", { value: url });
    return response;
  }
}
