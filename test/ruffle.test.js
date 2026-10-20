import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { createServer as createHttpServer } from "node:http";
import { gzipSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";

import {
  extractTarGz,
  fetchRuffle,
  findRuffleBuild,
  resolveRuffle,
  ruffleLabel,
} from "../src/ruffle.js";
import { DEFAULT_RUFFLE_URL, RUFFLE_VERSION } from "../src/util.js";

async function put(root, relative, contents) {
  const target = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
  return target;
}

function octal(value, width) {
  return `${value.toString(8).padStart(width - 1, "0")}\0`;
}

function tarEntry(name, data = Buffer.alloc(0), type = "0") {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write(octal(0o644, 8), 100, "latin1");
  header.write(octal(0, 8), 108, "latin1");
  header.write(octal(0, 8), 116, "latin1");
  header.write(octal(data.length, 12), 124, "latin1");
  header.write(octal(0, 12), 136, "latin1");
  header.write("        ", 148, "latin1");
  header.write(type, 156, "latin1");
  header.write("ustar\0", 257, "latin1");
  header.write("00", 263, "latin1");
  const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512);
  data.copy(padded);
  return Buffer.concat([header, padded]);
}

function makeTar(entries) {
  return gzipSync(Buffer.concat([...entries.map((entry) => tarEntry(entry.name, entry.data, entry.type)), Buffer.alloc(1024)]));
}

test("findRuffleBuild accepts flat and packaged layouts", async () => {
  const flat = await mkdtemp(path.join(os.tmpdir(), "swfbox-ruffle-flat-"));
  await writeFile(path.join(flat, "ruffle.js"), "console.log('ruffle')");
  const found = await findRuffleBuild(flat);
  assert.equal(found.script, "ruffle.js");
  assert.equal(found.dir, flat);

  const packaged = await mkdtemp(path.join(os.tmpdir(), "swfbox-ruffle-pack-"));
  await put(packaged, "package/ruffle.js", "console.log('packed')");
  const nested = await findRuffleBuild(packaged);
  assert.equal(nested.script, "ruffle.js");
  assert.equal(nested.dir, path.join(packaged, "package"));

  const empty = await mkdtemp(path.join(os.tmpdir(), "swfbox-ruffle-empty-"));
  assert.equal(await findRuffleBuild(empty), null);
});

test("resolveRuffle honours explicit URLs, folders and the root .swfbox", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "swfbox-resolve-"));
  const ruffleDir = await put(root, ".swfbox/ruffle/ruffle.js", "/* ruffle */");
  const dir = path.dirname(ruffleDir);

  const serve = await resolveRuffle({ root, mode: "serve" });
  assert.equal(serve.kind, "local");
  assert.equal(serve.dir, dir);
  assert.equal(serve.url, "/ruffle/ruffle.js");
  assert.match(serve.source, /\.swfbox/);

  const stat = await resolveRuffle({ root, mode: "static", outputDir: root });
  assert.equal(stat.kind, "local");
  assert.equal(stat.url, ".swfbox/ruffle/ruffle.js");

  const url = await resolveRuffle({ root, mode: "serve", explicit: "https://example.test/ruffle.js" });
  assert.equal(url.kind, "url");
  assert.equal(url.url, "https://example.test/ruffle.js");

  const explicitDir = await resolveRuffle({ root, mode: "serve", explicit: dir });
  assert.equal(explicitDir.kind, "local");
  assert.equal(explicitDir.source, "--ruffle");

  const cdn = await resolveRuffle({ root: await mkdtemp(path.join(os.tmpdir(), "swfbox-resolve-empty-")), mode: "serve", allowCdn: true });
  assert.equal(cdn.kind, "cdn");
  assert.equal(cdn.url, DEFAULT_RUFFLE_URL);

  await assert.rejects(() => resolveRuffle({ root, explicit: path.join(root, "missing") }), /not found/i);
});

test("ruffleLabel describes every source", () => {
  assert.equal(ruffleLabel(null), "not configured");
  assert.equal(ruffleLabel({ kind: "local" }), "local build");
  assert.match(ruffleLabel({ kind: "cdn" }), /unpkg CDN/);
  assert.match(ruffleLabel({ kind: "url" }), /custom URL/);
});

test("extractTarGz unpacks package files and rejects traversal", async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), "swfbox-tar-"));
  const archive = makeTar([
    { name: "package/ruffle.js", data: Buffer.from("/* ruffle */") },
    { name: "package/ruffle.wasm", data: Buffer.from([0, 97, 115, 109]) },
    { name: "package/licenses/LICENSE_MIT", data: Buffer.from("MIT") },
    { name: "package/", type: "5" },
  ]);
  const files = extractTarGz(archive, target);
  assert.deepEqual(files.sort(), ["licenses/LICENSE_MIT", "ruffle.js", "ruffle.wasm"]);
  assert.equal(await readFile(path.join(target, "ruffle.js"), "utf8"), "/* ruffle */");
  assert.deepEqual([...await readFile(path.join(target, "ruffle.wasm"))], [0, 97, 115, 109]);

  const evil = makeTar([{ name: "package/../../evil.js", data: Buffer.from("nope") }]);
  assert.throws(() => extractTarGz(evil, target), /unsafe path/i);

  const absolute = makeTar([{ name: "/etc/passwd", data: Buffer.from("nope") }]);
  assert.throws(() => extractTarGz(absolute, target), /unsafe path/i);

  const link = makeTar([{ name: "package/evil.js", data: Buffer.from("target"), type: "2" }]);
  assert.deepEqual(extractTarGz(link, target), []);
});

test("fetchRuffle downloads, extracts and fails with a manual alternative", async (t) => {
  const archive = makeTar([
    { name: "package/ruffle.js", data: Buffer.from("/* downloaded ruffle */") },
    { name: "package/ruffle.wasm", data: Buffer.from([0, 97, 115, 109]) },
  ]);

  let mode = "ok";
  const server = createHttpServer((request, response) => {
    if (mode === "404") {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not here");
      return;
    }
    response.writeHead(200, { "content-type": "application/gzip", "content-length": archive.length });
    response.end(archive);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const sourceUrl = `http://127.0.0.1:${server.address().port}/ruffle.tgz`;

  const root = await mkdtemp(path.join(os.tmpdir(), "swfbox-fetch-ok-"));
  const result = await fetchRuffle({ root, sourceUrl, timeoutMs: 5000 });
  assert.equal(result.version, RUFFLE_VERSION);
  assert.equal(result.files, 2);
  assert.equal(result.dir, path.join(root, ".swfbox", "ruffle"));
  assert.equal(await readFile(path.join(result.dir, "ruffle.js"), "utf8"), "/* downloaded ruffle */");
  assert.deepEqual([...await readFile(path.join(result.dir, "ruffle.wasm"))], [0, 97, 115, 109]);
  assert.match(result.license, /MIT/);

  mode = "404";
  const missingRoot = await mkdtemp(path.join(os.tmpdir(), "swfbox-fetch-404-"));
  await assert.rejects(() => fetchRuffle({ root: missingRoot, sourceUrl, timeoutMs: 5000 }), /manual alternative/i);
  assert.rejects(() => readFile(path.join(missingRoot, ".swfbox", "ruffle", "ruffle.js")), /ENOENT|no such file/i);

  const smallRoot = await mkdtemp(path.join(os.tmpdir(), "swfbox-fetch-cap-"));
  mode = "ok";
  await assert.rejects(() => fetchRuffle({ root: smallRoot, sourceUrl, timeoutMs: 5000, maxBytes: 64 }), /limit/i);
});

