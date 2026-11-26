// Changed by agentic-web. See README.md in this folder for what changed.
import { ActionRegistry, cloneData, validateData } from "./actions.js";
import { registerFormActions, watchHostForms } from "./form-actions.js";
import { loadDiscoveredActions } from "./discovered-actions.js";

const protocol = "nsdeploy-actions-v1";
export function sameOriginAsset(base, path) {
  const url = new URL(path, `${base.replace(/\/$/, "")}/`);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== new URL(base).origin || url.username || url.password) throw new Error("Action assets must belong to their publishing origin.");
  return url.href;
}
export async function loadActionModule(registry, scope, manifest, { bridge = false } = {}) {
  if (!manifest.actions) return;
  if (new URL(scope.base).origin !== location.origin) throw new Error("Executable action adapters must run on their own origin.");
  if (manifest.actions.version !== 1) throw new Error("Unsupported action protocol.");
  const actions = { register: definition => registry.register(scope, definition) };
  if (manifest.actions.catalog) await loadDiscoveredActions(actions, sameOriginAsset(scope.base, manifest.actions.catalog), manifest.actions.callerOrigins || []);
  for (const path of new Set([manifest.actions.module, ...(manifest.actions.modules || [])].filter(Boolean))) {
    const module = await import(sameOriginAsset(scope.base, path));
    if (typeof module.registerActions !== "function") throw new Error("Action modules must export registerActions.");
    await module.registerActions(actions);
  }
  await registerFormActions(actions, {
    pages: manifest.actions.pages || [], callerOrigins: manifest.actions.callerOrigins || [], base: scope.base,
    report: issue => { registry.discoveryIssues.push({ ...scope, ...issue }); console.warn("Action discovery:", issue); },
  });
  if (manifest.actions.hostPage && !bridge) {
    registry.hostForms?.dispose();
    registry.hostForms = watchHostForms(registry, scope, { onChange: () => registry.onChange?.() });
  }
  if (!registry.catalog(scope).length && !(manifest.actions.hostPage && !bridge)) {
    registry.discoveryIssues.push({ ...scope, page: "Action sources", reason: "No website actions connected. Check configured routes/modules on the actual application origin; a generated agent page supplies no business actions." });
  }
}

// Readable labels for a request's arguments: "roomId" is "Room ID", "expectedTotalCents"
// is "Expected total" in dollars. Every value is shown as text, never as markup.
function labelFor(key) {
  const words = String(key).replace(/Cents$/, "").replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim().split(/\s+/);
  return words.map((word, index) => {
    const lower = word.toLowerCase();
    if (["id", "url", "uri"].includes(lower)) return lower.toUpperCase();
    return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
  }).join(" ");
}

export function actionTitle(name) {
  return labelFor(name);
}

export function reviewRows(args) {
  if (!args || typeof args !== "object") return [];
  const rows = [];
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === "") continue;
    let shown;
    if (/Cents$/.test(key) && Number.isFinite(value)) shown = `$${(value / 100).toFixed(2)}`;
    else if (typeof value === "boolean") shown = value ? "Yes" : "No";
    else if (typeof value === "object") shown = JSON.stringify(value);
    else shown = String(value);
    rows.push([labelFor(key), shown]);
  }
  return rows;
}

const REVIEW_CSS = `
.nsr-dialog{max-width:560px;width:calc(100% - 32px);max-height:85vh;overflow:auto;border:1px solid #c9d3d6;border-radius:14px;padding:0;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#17262a;background:#fff;box-shadow:0 12px 40px rgba(16,38,44,.25)}
.nsr-dialog::backdrop{background:rgba(16,30,34,.45)}
.nsr-head{padding:20px 24px 12px;border-bottom:1px solid #e3e9ea}
.nsr-head h2{margin:0;font-size:1.15rem;line-height:1.3}
.nsr-head h2:focus{outline:none}
.nsr-head p{margin:4px 0 0;color:#566a6d;font-size:.9rem}
.nsr-item{padding:16px 24px;border-bottom:1px solid #e3e9ea}
.nsr-title{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 4px;font-weight:650;font-size:1.05rem}
.nsr-badge{font-size:.75rem;font-weight:600;padding:2px 8px;border-radius:999px;background:#fdecdf;color:#8a3a10;border:1px solid #f1c6a8}
.nsr-badge.write{background:#e6f1f3;color:#1b5e73;border-color:#bcd8de}
.nsr-desc{margin:0 0 10px;color:#566a6d;font-size:.9rem}
.nsr-rows{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:6px 16px;margin:0}
.nsr-rows dt{color:#566a6d}
.nsr-rows dd{margin:0;font-weight:550;overflow-wrap:anywhere}
.nsr-actions{display:flex;gap:10px;justify-content:flex-end;padding:16px 24px}
.nsr-actions button{font:inherit;font-weight:600;border-radius:8px;padding:9px 18px;cursor:pointer}
.nsr-yes{background:#1b5e73;color:#fff;border:1px solid #1b5e73}
.nsr-no{background:#fff;color:#17262a;border:1px solid #c9d3d6}
.nsr-actions button:focus-visible{outline:3px solid #f0a35c;outline-offset:2px}
`;

// Used by both the local UI and the trusted, first-party bridge popup.
export function reviewActions(items, title = "Review actions") {
  return new Promise(resolve => {
    if (!document.getElementById("nsr-style")) {
      const style = document.createElement("style"); style.id = "nsr-style"; style.textContent = REVIEW_CSS;
      document.head.append(style);
    }
    const dialog = document.createElement("dialog"); dialog.className = "nsr-dialog";
    const head = document.createElement("div"); head.className = "nsr-head";
    const heading = document.createElement("h2"); heading.textContent = title;
    // Start at the top of the dialog, on an element that Enter cannot activate.
    heading.tabIndex = -1; heading.autofocus = true;
    const intro = document.createElement("p"); intro.textContent = "Check the details. Nothing happens until you confirm.";
    head.append(heading, intro);
    dialog.append(head);
    for (const item of items) {
      const section = document.createElement("section"); section.className = "nsr-item";
      const name = document.createElement("p"); name.className = "nsr-title"; name.textContent = actionTitle(item.action);
      const badge = document.createElement("span");
      badge.className = item.effect === "irreversible" ? "nsr-badge" : "nsr-badge write";
      badge.textContent = item.effect === "irreversible" ? "Cannot be undone" : "Changes something";
      name.append(badge);
      const where = document.createElement("p"); where.className = "nsr-desc";
      where.textContent = [item.description, `Runs on ${item.origin}.`].filter(Boolean).join(" ");
      const rows = document.createElement("dl"); rows.className = "nsr-rows";
      for (const [label, value] of reviewRows(item.arguments)) {
        const dt = document.createElement("dt"); dt.textContent = label;
        const dd = document.createElement("dd"); dd.textContent = value;
        rows.append(dt, dd);
      }
      section.append(name, where, rows);
      dialog.append(section);
    }
    const actions = document.createElement("div"); actions.className = "nsr-actions";
    const yes = document.createElement("button"); yes.textContent = "Confirm actions"; yes.className = "nsr-yes";
    const no = document.createElement("button"); no.textContent = "Cancel"; no.className = "nsr-no";
    // close() returns focus to where the visitor was, such as the chat input.
    const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
    yes.onclick = () => finish(true); no.onclick = () => finish(false);
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(false); });
    actions.append(no, yes);
    dialog.append(actions); document.body.append(dialog); dialog.showModal();
  });
}

function openActionWindow(url, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("Action was cancelled.")); return; }
    const dialog = document.createElement("dialog");
    const text = document.createElement("p"); text.textContent = `Continue at ${new URL(url).origin} to authorize this action. Sign in there if needed.`;
    const open = document.createElement("button"); open.textContent = "Open action site";
    const cancel = document.createElement("button"); cancel.textContent = "Cancel";
    const cleanup = () => { dialog.close(); dialog.remove(); signal?.removeEventListener("abort", stop); };
    const stop = () => { cleanup(); reject(new Error("Action window cancelled; action not started.")); };
    open.onclick = () => {
      const popup = window.open(url, "_blank", "popup,width=700,height=650");
      if (!popup) { text.textContent = "Allow popups for this page, then try again."; return; }
      cleanup(); resolve(popup);
    };
    cancel.onclick = stop;
    signal?.addEventListener("abort", stop, { once: true });
    dialog.addEventListener("cancel", e => { e.preventDefault(); stop(); });
    dialog.append(text, open, cancel); document.body.append(dialog); dialog.showModal();
  });
}

export class ActionBridgeClient {
  constructor(url) { this.url = url; this.pending = new Map(); this.seq = 0; }
  async connect(popup = false, signal) {
    if (this.port) return;
    const origin = new URL(this.url).origin;
    // Register listener before window.open; the bridge repeatedly announces ready
    // until connected, avoiding races while the user opens its popup.
    let peer;
    const ready = new Promise((resolve, reject) => {
      this.rejectHandshake = reject;
      this.handshakeCleanup = () => { clearTimeout(timer); window.removeEventListener("message", receive); };
      const receive = event => {
        if (event.source !== peer || event.origin !== origin || event.data?.protocol !== protocol || event.data?.type !== "ready") return;
        const channel = new MessageChannel();
        this.port = channel.port1;
        this.port.onmessage = ({ data }) => {
          const p = this.pending.get(data?.id);
          if (!p) return;
          this.pending.delete(data.id); clearTimeout(p.timer);
          data.ok ? p.resolve(data.value) : p.reject(new Error(data.error));
        };
        peer.postMessage({ protocol, type: "connect" }, origin, [channel.port2]);
        this.handshakeCleanup(); this.rejectHandshake = null; resolve();
      };
      const timer = setTimeout(() => { this.handshakeCleanup(); reject(new Error("Action bridge unavailable. Check framing policy, callerOrigins and login; no action was sent.")); }, popup ? 120000 : 10000);
      window.addEventListener("message", receive);
    });
    // Attach rejection immediately even while waiting for the user's click.
    ready.catch(() => {});
    try {
      if (popup) { peer = await openActionWindow(this.url, signal); this.popup = peer; }
      else {
        this.frame = document.createElement("iframe");
        this.frame.hidden = true; this.frame.title = "Site action bridge";
        this.frame.sandbox = "allow-scripts allow-same-origin";
        this.frame.src = this.url; document.body.append(this.frame); peer = this.frame.contentWindow;
      }
      await ready;
      if (this.popup) this.closeWatch = setInterval(() => { if (this.popup.closed) this.dispose(); }, 500);
    } catch (error) { this.dispose(); throw error; }
  }
  request(type, payload = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("Action response timed out; outcome unknown. Check the site before retrying.")); }, type === "execute" ? 180000 : 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.port.postMessage({ ...cloneData(payload), id, type });
    });
  }
  dispose() {
    clearInterval(this.closeWatch);
    this.rejectHandshake?.(new Error("Action bridge closed.")); this.rejectHandshake = null;
    this.handshakeCleanup?.(); this.port?.close(); this.port = null;
    this.frame?.remove(); this.popup?.close();
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error("Action bridge closed; outcome unknown.")); }
    this.pending.clear();
  }
}

export async function registerRemoteActions(registry, scope, manifest) {
  if (!manifest.actions) return;
  if (manifest.actions.version !== 1) throw new Error("Unsupported action protocol.");
  const url = sameOriginAsset(scope.base, manifest.actions.bridge);
  registry.remoteLoads ||= new Map();
  const key = `${scope.base}::${scope.network}`;
  if (registry.remoteLoads.has(key)) return registry.remoteLoads.get(key);
  const loading = discoverRemoteActions(registry, scope, url);
  registry.remoteLoads.set(key, loading);
  try { await loading; } catch (error) { registry.remoteLoads.delete(key); throw error; }
  finally { registry.onChange?.(); }
}

async function discoverRemoteActions(registry, scope, url) {
  const client = new ActionBridgeClient(url);
  const registered = [];
  try {
    try { await client.connect(); }
    catch { await client.connect(true); } // explicit user-opened fallback for framing restrictions
    const catalog = await client.request("catalog");
    if (!Array.isArray(catalog) || catalog.length > 100) throw new Error("Invalid remote action catalog.");
    if (!catalog.length) registry.discoveryIssues.push({ ...scope, page: "Remote action bridge", reason: "No actions exposed to this caller. Check the remote site's action sources and callerOrigins; host-page forms are local only." });
    for (const definition of catalog) registered.push(registry.register(scope, definition, async (args, { requestId, signal }) => {
      // Mutations are approved on the owning origin in a top-level window. The
      // receiving bridge enforces this independently of the caller's catalog.
      const executor = new ActionBridgeClient(url);
      const abort = () => executor.dispose();
      signal?.addEventListener("abort", abort, { once: true });
      try {
        if (signal?.aborted) throw new Error("Action was cancelled.");
        await executor.connect(definition.effect !== "read" || definition.availability === "top-level", signal);
        if (signal?.aborted) throw new Error("Action was cancelled.");
        return await executor.request("execute", { name: definition.name, args, requestId });
      } finally { signal?.removeEventListener("abort", abort); executor.dispose(); }
    }));
  } catch (error) {
    for (const ref of registered) registry.entries.delete(ref);
    throw error;
  } finally { client.dispose(); }
}

export async function serveActionBridge() {
  const base = new URL("./", location.href).href.replace(/\/$/, "");
  const response = await fetch(`${base}/agent-manifest.json`);
  if (!response.ok) throw new Error("Cannot load action manifest.");
  const manifest = await response.json();
  const registry = new ActionRegistry();
  const scope = { base, network: manifest.networks[0].name };
  await loadActionModule(registry, scope, manifest, { bridge: true });
  const peer = window.opener || (window.parent !== window ? window.parent : null);
  if (!peer) { document.body.append("Open this page through an agent action."); return; }
  let connected = false;
  const ready = () => { if (!connected) peer.postMessage({ protocol, type: "ready" }, "*"); }; // readiness only, no data
  const interval = setInterval(ready, 250); ready();
  window.addEventListener("pagehide", () => clearInterval(interval), { once: true });
  window.addEventListener("message", event => {
    if (connected || event.source !== peer || event.origin === "null" || event.data?.protocol !== protocol || event.data?.type !== "connect" || event.ports.length !== 1) return;
    connected = true; clearInterval(interval);
    const caller = event.origin;
    const allowed = [...registry.entries.values()].filter(e => e.availability !== "local-only" && (e.callerOrigins.includes(caller) || e.callerOrigins.includes("*")));
    const port = event.ports[0]; const seen = new Set(); let busy = false;
    port.onmessage = async ({ data }) => {
      const id = data?.id;
      if (!Number.isSafeInteger(id)) return;
      try {
        const request = cloneData(data);
        if (request.type === "catalog") {
          const value = allowed.map(({ name, description, inputSchema, outputSchema, effect, availability }) => ({ name, description, inputSchema, outputSchema, effect, availability }));
          port.postMessage({ id, ok: true, value }); return;
        }
        if (request.type !== "execute" || busy) throw new Error("Invalid or concurrent action request.");
        const entry = allowed.find(e => e.name === request.name);
        if (!entry) throw new Error("Action is not exposed to this caller.");
        if (entry.effect !== "read" || entry.availability === "top-level") {
          if (window.top !== window || !window.opener) throw new Error("This action requires its own confirmation window.");
        }
        if (typeof request.requestId !== "string" || request.requestId.length > 200 || seen.has(request.requestId)) throw new Error("Invalid or repeated request ID.");
        validateData(entry.inputSchema, request.args);
        busy = true;
        try {
          if (entry.effect !== "read" && !await reviewActions([{ action: entry.name, description: entry.description, origin: location.origin, effect: entry.effect, arguments: request.args }], `Request from ${caller}`)) throw new Error("User declined; action not started.");
          seen.add(request.requestId);
          const value = cloneData(await entry.execute(request.args, { requestId: request.requestId, callerOrigin: caller }));
          if (entry.outputSchema) validateData(entry.outputSchema, value, "result");
          port.postMessage({ id, ok: true, value });
        } finally { busy = false; }
      } catch (error) { port.postMessage({ id, ok: false, error: String(error.message || error) }); }
    };
    port.start();
  });
}
