import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";

import { buildSwf, metadataTag } from "../test-support/swf-builder.js";

const BIN = fileURLToPath(new URL("../bin/swfbox.js", import.meta.url));

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    cwd: options.cwd,
    env: { ...process.env, NO_COLOR: "1", ...options.env },
    timeout: 60000,
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    output: `${result.stdout || ""}${result.stderr || ""}`,
    error: result.error,
  };
}

async function put(root, relative, contents) {
  const target = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
  return target;
}

async function archive() {
  const root = await mkdtemp(path.join(os.tmpdir(), "swfbox-cli-"));
  await put(
    root,
    "intro.swf",
    buildSwf({
      width: 550,
      height: 400,
      fps: 24,
      frames: 6,
      tags: [metadataTag({ title: "CLI Movie", creator: "Test Suite" })],
    }),
  );
  await put(root, "nested/second.swf", buildSwf({ width: 320, height: 240, fps: 12, frames: 2 }));
  await put(root, "broken.swf", Buffer.from("definitely not a swf"));
  return root;
}

test("help and version work without touching a folder", () => {
  const help = run(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage/);
  assert.match(help.stdout, /swfbox serve/);
  assert.match(help.stdout, /--fetch-ruffle/);
  assert.match(help.stdout, /Ruffle/);
  assert.match(help.stdout, /Exit codes/);
  assert.doesNotMatch(help.stdout, /\n\s+at /);

  const version = run(["--version"]);
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), "swfbox 0.1.0");
});

test("inspect prints metadata and exits 0 for a good file", async () => {
  const root = await archive();
  const result = run(["inspect", path.join(root, "intro.swf"), "--no-color"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /550 × 400 px/);
  assert.match(result.stdout, /11000 × 8000 twips/);
  assert.match(result.stdout, /24 fps/);
  assert.match(result.stdout, /CLI Movie/);
  assert.match(result.stdout, /AS3|not declared/);
  assert.match(result.stdout, /Tags/);
  assert.doesNotMatch(result.output, /\n\s+at /);
});

test("inspect is honest about broken and missing files", async () => {
  const root = await archive();
  const broken = run(["inspect", path.join(root, "broken.swf"), "--no-color"]);
  assert.equal(broken.status, 1);
  assert.match(broken.output, /Not an SWF file/i);
  assert.doesNotMatch(broken.output, /\n\s+at /);

  const empty = path.join(root, "empty.swf");
  await writeFile(empty, Buffer.alloc(0));
  const emptyResult = run(["inspect", empty, "--no-color"]);
  assert.equal(emptyResult.status, 1);
  assert.match(emptyResult.output, /Empty file/i);

  const missing = run(["inspect", path.join(root, "missing.swf"), "--no-color"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /File not found/i);

  const noArg = run(["inspect"]);
  assert.equal(noArg.status, 1);
  assert.match(noArg.stderr, /needs a file/i);
});

test("inspect --format json is sorted, parseable and exit-code aware", async () => {
  const root = await archive();
  const good = run(["inspect", path.join(root, "intro.swf"), "--format", "json"]);
  assert.equal(good.status, 0);
  const record = JSON.parse(good.stdout);
  assert.equal(record.width, 550);
  assert.equal(record.height, 400);
  assert.equal(record.frameRate, 24);
  assert.equal(record.metadata.title, "CLI Movie");
  assert.equal(record.error, null);
  const keys = Object.keys(record);
  assert.deepEqual(keys, [...keys].sort());

  const bad = run(["inspect", path.join(root, "broken.swf"), "-f", "json"]);
  assert.equal(bad.status, 1);
  const brokenRecord = JSON.parse(bad.stdout);
  assert.match(brokenRecord.error, /Not an SWF/i);

  const asHtml = run(["inspect", path.join(root, "intro.swf"), "-f", "html"]);
  assert.equal(asHtml.status, 1);
  assert.match(asHtml.stderr, /text or --format json/);
});

test("default scan writes a self-contained HTML report", async () => {
  const root = await archive();
  const output = path.join(root, "report.html");
  const result = run([root, "-o", output, "--no-color"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Wrote/);
  assert.match(result.stdout, /AS3|AS2|unknown/);

  const html = await readFile(output, "utf8");
  assert.match(html, /CLI Movie/);
  assert.match(html, /nested\/second\.swf/);
  assert.match(html, /Could not read/);
  assert.equal(/https?:\/\//i.test(html), false);
  assert.equal(/\u001b\[/.test(html), false);
  assert.match(html, /data-theme="dark"/);
});

test("scan supports json and text formats", async () => {
  const root = await archive();
  const json = run([root, "--format=json"]);
  assert.equal(json.status, 0);
  const library = JSON.parse(json.stdout);
  assert.equal(library.counts.total, 3);

  const alias = run([root, "--json"]);
  assert.equal(alias.status, 0);
  assert.equal(JSON.parse(alias.stdout).counts.total, 3);

  assert.equal(library.counts.broken, 1);
  assert.equal(library.counts.readable, 2);
  assert.equal(library.entries.length, 3);
  assert.deepEqual(Object.keys(library), [...Object.keys(library)].sort());
  for (const entry of library.entries) {
    assert.equal(entry.error === null || typeof entry.error === "string", true);
    assert.notEqual(entry.title, undefined);
  }

  const text = run([root, "--format", "text", "--no-color"]);
  assert.equal(text.status, 0);
  assert.match(text.stdout, /intro\.swf/);
  assert.match(text.stdout, /nested\/second\.swf/);
  assert.doesNotMatch(text.stdout, /\u001b\[/);
});

test("an empty folder exits 1 with a clear message", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "swfbox-empty-"));
  const output = path.join(root, "empty.html");
  const result = run([root, "-o", output, "--no-color"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No SWF files found/i);
  const html = await readFile(output, "utf8");
  assert.match(html, /No SWF files were found here yet/);
  assert.match(html, /"total":0/);
});

test("max-files and warnings are reflected in the output", async () => {
  const root = await archive();
  const result = run([root, "--format", "json", "--max-files", "1"]);
  assert.equal(result.status, 0);
  const library = JSON.parse(result.stdout);
  assert.equal(library.capped, true);
  assert.equal(library.entries.length, 1);
  assert.ok(library.warnings.some((warning) => /limit/i.test(warning)));
});

test("invalid options and bad input exit 1 without a stack trace", async () => {
  const format = run(["--format", "xml"]);
  assert.equal(format.status, 1);
  assert.match(format.stderr, /Unknown format/i);

  const option = run(["--wat"]);
  assert.equal(option.status, 1);
  assert.match(option.stderr, /Unknown option/i);

  const port = run(["serve", "--port", "not-a-number"]);
  assert.equal(port.status, 1);
  assert.match(port.stderr, /Invalid port/i);

  const missingDir = run([path.join(os.tmpdir(), "swfbox-does-not-exist-12345")]);
  assert.equal(missingDir.status, 1);
  assert.match(missingDir.stderr, /Folder not found/i);

  for (const result of [format, option, port, missingDir]) {
    assert.doesNotMatch(result.output, /\n\s+at /);
  }
});

test("--ruffle accepts a local build and rejects a missing one", async () => {
  const root = await archive();
  const ruffleDir = await mkdtemp(path.join(os.tmpdir(), "swfbox-cli-ruffle-"));
  await writeFile(path.join(ruffleDir, "ruffle.js"), "window.RufflePlayer={};");
  await writeFile(path.join(ruffleDir, "ruffle.wasm"), Buffer.from([0, 97, 115, 109]));

  const output = path.join(root, "with-ruffle.html");
  const result = run([root, "--ruffle", ruffleDir, "-o", output, "--no-color"]);
  assert.equal(result.status, 0);
  const html = await readFile(output, "utf8");
  assert.match(html, /"kind":"local"/);
  assert.match(html, /Ruffle · local build/);
  assert.match(html, /ruffle\.js/);

  const bad = run([root, "--ruffle", path.join(root, "no-such-ruffle"), "-o", path.join(root, "x.html")]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Ruffle path not found/i);
});

test("empty serve and broken play exit 1", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "swfbox-cli-serve-"));
  const serve = run(["serve", root]);
  assert.equal(serve.status, 1);
  assert.match(serve.stderr, /No SWF files found/i);

  const archiveRoot = await archive();
  const play = run(["play", path.join(archiveRoot, "broken.swf"), "--no-color"]);
  assert.equal(play.status, 1);
  assert.match(play.stderr, /Could not read|Not an SWF/i);
});
