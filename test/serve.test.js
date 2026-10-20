import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";

import { buildLibrary } from "../src/library.js";
import { scanFolder } from "../src/scan.js";
import { createServer, safeResolve, startServer } from "../src/serve.js";
import { buildSwf, metadataTag } from "../test-support/swf-builder.js";

async function put(root, relative, contents) {
  const target = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
  return target;
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "swfbox-serve-"));
  const ruffleDir = await mkdtemp(path.join(os.tmpdir(), "swfbox-ruffle-"));
  const good = buildSwf({
    width: 550,
    height: 400,
    fps: 24,
    frames: 6,
    tags: [metadataTag({ title: "Served <Movie>", creator: "Tester" })],
  });
  await put(root, "intro.swf", good);
  await put(root, "shows/Episode 1.swf", buildSwf({ width: 640, height: 480, tags: [metadataTag({ title: "Episode One" })] }));
  await put(root, "broken.swf", Buffer.from("not an swf"));
  await put(root, "private.txt", "TOP-SECRET-DO-NOT-SERVE");
  await put(ruffleDir, "ruffle.js", "/* fake ruffle */\nwindow.RufflePlayer={};");
  await put(ruffleDir, "ruffle.wasm", Buffer.from([0x00, 0x61, 0x73, 0x6d]));

  const scan = await scanFolder(root);
  const ruffle = {
    kind: "local",
    dir: ruffleDir,
    script: "ruffle.js",
    absolute: path.join(ruffleDir, "ruffle.js"),
    url: "/ruffle/ruffle.js",
  };
  const library = buildLibrary(scan, { mode: "serve", ruffle, generatedAt: "2026-01-01T00:00:00.000Z" });
  return { root, ruffleDir, ruffle, library, good };
}

test("safeResolve rejects traversal, absolutes and NUL bytes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "swfbox-guard-"));
  const inside = path.join(root, "sub", "movie.swf");
  assert.equal(safeResolve(root, "sub/movie.swf"), inside);
  assert.equal(safeResolve(root, "sub\\movie.swf"), inside);
  assert.equal(safeResolve(root, "../secret.swf"), null);
  assert.equal(safeResolve(root, "..\\secret.swf"), null);
  assert.equal(safeResolve(root, "sub/../../secret.swf"), null);
  assert.equal(safeResolve(root, "/etc/passwd"), null);
  assert.equal(safeResolve(root, "C:\\Windows\\win.ini"), null);
  assert.equal(safeResolve(root, "bad\0name.swf"), null);
  assert.equal(safeResolve(root, ""), null);
  assert.equal(safeResolve(root, "."), null);
});

test("server serves health, library, SWF bytes, player and Ruffle", async (t) => {
  const { root, library, good } = await fixture();
  const handle = await startServer({ library, root, ruffle: library.ruffle, port: 0 });
  t.after(() => handle.close());

  const health = await fetch(`${handle.url}/health`);
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.name, "swfbox");
  assert.equal(healthBody.files, 3);
  assert.equal(healthBody.broken, 1);
  assert.equal(healthBody.ruffle, "local");

  const home = await fetch(`${handle.url}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /text\/html/);
  const html = await home.text();
  assert.ok(html.includes("Served \\u003cMovie\\u003e"));
  assert.match(html, /Episode One/);
  assert.match(html, /Could not read/);
  assert.match(html, /Ruffle · local build/);
  assert.match(html, /\/player\?f=intro\.swf/);
  assert.match(html, /\/swf\/shows\/Episode%201\.swf/);

  const swf = await fetch(`${handle.url}/swf/intro.swf`);
  assert.equal(swf.status, 200);
  assert.equal(swf.headers.get("content-type"), "application/x-shockwave-flash");
  const bytes = Buffer.from(await swf.arrayBuffer());
  assert.equal(bytes.length, good.length);
  assert.equal(bytes.subarray(0, 3).toString("latin1"), "FWS");
  assert.equal(swf.headers.get("x-content-type-options"), "nosniff");

  const encoded = await fetch(`${handle.url}/swf/shows/Episode%201.swf`);
  assert.equal(encoded.status, 200);
  assert.equal(Buffer.from(await encoded.arrayBuffer()).length > 8, true);

  const player = await fetch(`${handle.url}/player?f=intro.swf`);
  assert.equal(player.status, 200);
  const playerHtml = await player.text();
  assert.match(playerHtml, /data-src="\/swf\/intro\.swf"/);
  assert.match(playerHtml, /data-ruffle="\/ruffle\/ruffle\.js"/);
  assert.match(playerHtml, /Loading Ruffle/);
  assert.match(playerHtml, /Served &lt;Movie&gt;/);
  assert.match(playerHtml, /id="nav-next"/);
  assert.match(playerHtml, /ArrowLeft|←/);

  const ruffleJs = await fetch(`${handle.url}/ruffle/ruffle.js`);
  assert.equal(ruffleJs.status, 200);
  assert.match(ruffleJs.headers.get("content-type"), /javascript/);
  assert.match(await ruffleJs.text(), /fake ruffle/);

  const wasm = await fetch(`${handle.url}/ruffle/ruffle.wasm`);
  assert.equal(wasm.status, 200);
  assert.equal(wasm.headers.get("content-type"), "application/wasm");

  const head = await fetch(`${handle.url}/swf/intro.swf`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), String(good.length));

  const favicon = await fetch(`${handle.url}/favicon.ico`);
  assert.equal(favicon.status, 204);

  const missing = await fetch(`${handle.url}/no-such-page`);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /Not found/);
});

test("player page for a broken file explains the error", async (t) => {
  const { root, library } = await fixture();
  const noRuffleLibrary = { ...library, ruffle: null };
  const handle = await startServer({ library: noRuffleLibrary, root, ruffle: null, port: 0 });
  t.after(() => handle.close());

  const player = await fetch(`${handle.url}/player?f=broken.swf`);
  assert.equal(player.status, 200);
  const html = await player.text();
  assert.match(html, /could not be read/i);
  assert.match(html, /Not an SWF file/);
  assert.equal(html.includes("<ruffle-player"), false);

  const noRuffle = await fetch(`${handle.url}/player?f=intro.swf`);
  assert.match(await noRuffle.text(), /No Ruffle configured/);
});

test("traversal and unindexed files are refused", async (t) => {
  const { root, library } = await fixture();
  const handle = await startServer({ library, root, ruffle: library.ruffle, port: 0 });
  t.after(() => handle.close());

  const attempts = [
    "/swf/..%2Fprivate.txt",
    "/swf/%2e%2e%2fprivate.txt",
    "/swf/%2E%2E%2F%2E%2E%2Fprivate.txt",
    "/swf/sub%2F..%2F..%2Fprivate.txt",
    "/swf/private.txt",
    "/swf/..%5Cprivate.txt",
    "/player?f=..%2Fprivate.txt",
    "/player?f=%2e%2e%2fprivate.txt",
    "/ruffle/..%2Fprivate.txt",
    "/ruffle/%2e%2e%2f%2e%2e%2fprivate.txt",
  ];
  for (const attempt of attempts) {
    const response = await fetch(`${handle.url}${attempt}`);
    assert.ok(response.status === 403 || response.status === 404, `${attempt} returned ${response.status}`);
    const body = await response.text();
    assert.equal(body.includes("TOP-SECRET-DO-NOT-SERVE"), false, `${attempt} leaked a file`);
  }
});

test("only GET and HEAD are accepted", async (t) => {
  const { root, library } = await fixture();
  const handle = await startServer({ library, root, ruffle: null, port: 0 });
  t.after(() => handle.close());

  const post = await fetch(`${handle.url}/`, { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
});

test("port auto-increments when the requested port is busy", async (t) => {
  const { root, library } = await fixture();
  const first = await startServer({ library, root, ruffle: null, port: 0 });
  t.after(() => first.close());
  const second = await startServer({ library, root, ruffle: null, port: first.port });
  t.after(() => second.close());

  assert.notEqual(second.port, first.port);
  assert.ok(second.port > first.port);
  const health = await fetch(`${second.url}/health`);
  assert.equal((await health.json()).ok, true);
});

test("createServer can be used directly with node:http", async (t) => {
  const { root, library } = await fixture();
  const server = createServer({ library, root, ruffle: null });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).files, 3);
});
