/**
 * Local HTTP server: library page, player page, SWF bytes and vendored Ruffle.
 *
 * Node http only. Binds to 127.0.0.1 by default. Every path that comes from the
 * URL is resolved and then checked to be inside its designated root — and SWFs
 * must additionally exist in the scanned index.
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { findEntry } from "./library.js";
import { renderHtml } from "./render-html.js";
import { renderPlayerPage } from "./player.js";
import { escapeHtml, toPosix, VERSION } from "./util.js";

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".swf": "application/x-shockwave-flash",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".license": "text/plain; charset=utf-8",
};

/**
 * Resolve a URL-ish relative path inside a root. Returns null for traversal,
 * absolute paths, NUL bytes and anything that escapes the root.
 */
export function safeResolve(root, relative) {
  if (typeof relative !== "string" || relative.length === 0) return null;
  if (relative.includes("\0")) return null;
  const cleaned = relative.replace(/\\/g, "/");
  if (cleaned.startsWith("/") || /^[A-Za-z]:/.test(cleaned)) return null;
  if (cleaned.split("/").some((segment) => segment === "..")) return null;

  const rootResolved = path.resolve(root);
  const candidate = path.resolve(rootResolved, cleaned);
  const check = path.relative(rootResolved, candidate);
  if (check === "" || check.startsWith("..") || path.isAbsolute(check)) return null;
  return candidate;
}

function send(res, status, body, headers = {}, method = "GET") {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ""), "utf8");
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": payload.length,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...headers,
  });
  if (method === "HEAD") res.end();
  else res.end(payload);
}

function sendJson(res, status, value, method = "GET") {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  send(res, status, payload, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, method);
}

function errorPage(title, message) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — swfbox</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050814;color:#e9edff;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .box{max-width:560px;padding:34px;border:1px solid rgba(148,163,255,.16);border-radius:18px;
    background:linear-gradient(160deg,rgba(23,31,61,.8),rgba(11,16,35,.92));box-shadow:0 30px 80px -40px #000}
  h1{margin:0 0 10px;font-size:24px;letter-spacing:-.03em}
  p{margin:0 0 18px;color:#96a1c6;font-size:14px;line-height:1.55}
  code{font-family:ui-monospace,Consolas,monospace;background:rgba(139,92,246,.14);border:1px solid rgba(139,92,246,.25);
    border-radius:6px;padding:2px 6px;color:#c4b5fd;font-size:12px}
  a{color:#67e8f9;text-decoration:none;font-weight:600;font-size:13px}
  a:hover{text-decoration:underline}
  .b{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:10px;margin-bottom:16px;
    background:linear-gradient(115deg,#8b5cf6,#22d3ee);color:#070a18;font-weight:800}
</style></head>
<body><div class="box"><div class="b">!</div><h1>${escapeHtml(title)}</h1><p>${message}</p><a href="/">Back to the library</a></div></body></html>`;
}

function serveFile(req, res, absolutePath, urlPath) {
  return stat(absolutePath)
    .then((info) => {
      if (!info.isFile()) {
        send(res, 404, errorPage("Not found", "That path is not a file."), {}, req.method);
        return;
      }
      const type = MIME[path.extname(absolutePath).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": type,
        "Content-Length": info.size,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": urlPath.startsWith("/ruffle/") ? "public, max-age=86400" : "no-cache",
        "Referrer-Policy": "no-referrer",
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      const stream = createReadStream(absolutePath);
      stream.on("error", () => {
        if (!res.headersSent) send(res, 500, "Could not read file");
        else res.destroy();
      });
      stream.pipe(res);
    })
    .catch(() => {
      send(res, 404, errorPage("Not found", "That file is no longer on disk."), {}, req.method);
    });
}

/**
 * @param {object} options
 * @param {object} options.library library model built with mode "serve"
 * @param {string} options.root scanned root
 * @param {object|null} [options.ruffle]
 */
export function createServer(options) {
  const library = options.library;
  const root = path.resolve(options.root || library.root);
  const ruffle = options.ruffle || null;
  const ruffleDir = ruffle && ruffle.kind === "local" ? path.resolve(ruffle.dir) : null;
  const startedAt = Date.now();

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        send(res, 405, errorPage("Method not allowed", "swfbox only serves GET and HEAD requests."), { Allow: "GET, HEAD" }, req.method);
        return;
      }

      const url = new URL(req.url || "/", "http://swfbox.local");
      const pathname = url.pathname;

      if (pathname === "/health") {
        sendJson(
          res,
          200,
          {
            ok: true,
            name: "swfbox",
            version: VERSION,
            files: library.counts.total,
            readable: library.counts.readable,
            broken: library.counts.broken,
            ruffle: ruffle ? ruffle.kind : "none",
            uptimeMs: Date.now() - startedAt,
          },
          req.method,
        );
        return;
      }

      if (pathname === "/") {
        send(res, 200, renderHtml(library), {}, req.method);
        return;
      }

      if (pathname === "/favicon.ico") {
        res.writeHead(204, { "Cache-Control": "public, max-age=86400" });
        res.end();
        return;
      }

      if (pathname === "/robots.txt") {
        send(res, 200, "User-agent: *\nDisallow: /\n", { "Content-Type": "text/plain; charset=utf-8" }, req.method);
        return;
      }

      if (pathname === "/swf" || pathname.startsWith("/swf/")) {
        let decoded;
        try {
          decoded = decodeURIComponent(pathname.slice("/swf/".length));
        } catch {
          send(res, 400, errorPage("Bad request", "The SWF path is not valid percent-encoding."), {}, req.method);
          return;
        }
        const normalised = toPosix(decoded).replace(/^\/+/, "");
        const entry = findEntry(library, normalised);
        if (!entry) {
          send(
            res,
            404,
            errorPage("SWF not in this library", `No indexed file matches <code>${escapeHtml(normalised)}</code>.`),
            {},
            req.method,
          );
          return;
        }
        const guarded = safeResolve(root, entry.relativePath);
        if (!guarded || guarded !== path.resolve(entry.path)) {
          send(res, 403, errorPage("Forbidden", "That path escapes the library root."), {}, req.method);
          return;
        }
        await serveFile(req, res, guarded, pathname);
        return;
      }

      if (pathname === "/player") {
        const requested = url.searchParams.get("f");
        const entry = requested ? findEntry(library, requested) : null;
        if (!entry) {
          send(
            res,
            404,
            errorPage(
              "Player: file not found",
              requested
                ? `No indexed SWF matches <code>${escapeHtml(requested)}</code>.`
                : "Pass a file with <code>/player?f=path/to/file.swf</code>.",
            ),
            {},
            req.method,
          );
          return;
        }
        send(res, 200, renderPlayerPage(library, entry), {}, req.method);
        return;
      }

      if (pathname.startsWith("/ruffle/")) {
        if (!ruffleDir) {
          send(res, 404, errorPage("Ruffle is not vendored", "This server uses a CDN build or has no Ruffle configured."), {}, req.method);
          return;
        }
        let decoded;
        try {
          decoded = decodeURIComponent(pathname.slice("/ruffle/".length));
        } catch {
          send(res, 400, errorPage("Bad request", "The Ruffle path is not valid percent-encoding."), {}, req.method);
          return;
        }
        const target = safeResolve(ruffleDir, decoded);
        if (!target) {
          send(res, 403, errorPage("Forbidden", "That path escapes the Ruffle folder."), {}, req.method);
          return;
        }
        await serveFile(req, res, target, pathname);
        return;
      }

      send(res, 404, errorPage("Not found", `Nothing is served at <code>${escapeHtml(pathname)}</code>.`), {}, req.method);
    } catch (error) {
      if (!res.headersSent) {
        send(res, 500, errorPage("Server error", escapeHtml(error?.message || "Unexpected error")), {}, req.method);
      } else {
        res.destroy();
      }
    }
  });

  server.on("clientError", (error, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  });

  return server;
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

/**
 * Start serving, auto-incrementing the port when it is busy.
 * @returns {Promise<{server: http.Server, port: number, host: string, url: string, close: () => Promise<void>}>}
 */
export async function startServer(options) {
  const host = options.host || "127.0.0.1";
  const requested = Number.isInteger(options.port) ? options.port : 8080;
  const server = createServer(options);
  let port = requested;
  let lastError = null;

  if (requested === 0) {
    await listen(server, 0, host);
    port = server.address().port;
  } else {
    for (let offset = 0; offset < 20; offset += 1) {
      try {
        await listen(server, requested + offset, host);
        port = requested + offset;
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (error?.code !== "EADDRINUSE") throw error;
      }
    }
    if (lastError) {
      throw new Error(`Could not find a free port between ${requested} and ${requested + 19}`);
    }
  }

  const url = `http://${host}:${port}`;
  return {
    server,
    port,
    host,
    url,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        if (typeof server.closeAllConnections === "function") server.closeAllConnections();
      }),
  };
}
