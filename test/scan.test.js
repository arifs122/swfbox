import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";

import { isSwfName, scanFolder } from "../src/scan.js";
import { buildSwf, metadataTag } from "../test-support/swf-builder.js";

async function tempRoot(prefix = "swfbox-scan-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function put(root, relative, contents) {
  const target = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
  return target;
}

test("isSwfName is case-insensitive and strict", () => {
  assert.equal(isSwfName("movie.swf"), true);
  assert.equal(isSwfName("MOVIE.SWF"), true);
  assert.equal(isSwfName("movie.SwF"), true);
  assert.equal(isSwfName("movie.swfx"), false);
  assert.equal(isSwfName("swf"), false);
  assert.equal(isSwfName(".swf"), true);
  assert.equal(isSwfName(null), false);
});

test("recursive scan finds nested, uppercase and unicode SWFs", async () => {
  const root = await tempRoot();
  const good = buildSwf({ width: 320, height: 240, tags: [metadataTag({ title: "Root" })] });
  await put(root, "a.swf", good);
  await put(root, "Sub/B.SWF", buildSwf({ width: 100, height: 50 }));
  await put(root, "deep/nested/c.swf", buildSwf({ width: 640, height: 480 }));
  await put(root, "üñïcode film.swf", buildSwf({ width: 200, height: 200 }));
  await put(root, "notes.txt", "not a swf");
  await put(root, ".hidden/secret.swf", good);
  await put(root, ".hidden/deeper/secret2.swf", good);

  const result = await scanFolder(root);
  const names = result.files.map((file) => file.relativePath);
  assert.equal(result.found, 4);
  assert.equal(result.capped, false);
  assert.deepEqual(names, ["Sub/B.SWF", "a.swf", "deep/nested/c.swf", "üñïcode film.swf"].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
  assert.ok(result.files.every((file) => file.error === null));
  assert.ok(result.files.every((file) => file.modified));
  assert.ok(result.files.every((file) => !file.relativePath.includes("\\")), "relative paths use forward slashes");
  assert.equal(result.durationMs >= 0, true);
});

test("broken files stay in the index with their error", async () => {
  const root = await tempRoot();
  await put(root, "good.swf", buildSwf({ width: 550, height: 400 }));
  await put(root, "empty.swf", Buffer.alloc(0));
  await put(root, "wrong.swf", Buffer.from("MZ\x90\x00this is an executable"));
  await put(root, "lzma.swf", buildSwf({ signature: "ZWS" }));
  const corruptHeader = Buffer.alloc(8);
  corruptHeader.write("CWS", 0, "latin1");
  corruptHeader[3] = 10;
  corruptHeader.writeUInt32LE(100, 4);
  await put(root, "corrupt.swf", Buffer.concat([corruptHeader, Buffer.from("nope")]));

  const result = await scanFolder(root);
  assert.equal(result.found, 5);
  const byName = Object.fromEntries(result.files.map((file) => [file.name, file]));
  assert.equal(byName["good.swf"].error, null);
  assert.match(byName["empty.swf"].error, /Empty file/i);
  assert.match(byName["wrong.swf"].error, /Not an SWF file/i);
  assert.equal(byName["lzma.swf"].compression, "lzma");
  assert.match(byName["lzma.swf"].error, /LZMA/i);
  assert.match(byName["corrupt.swf"].error, /decompress/i);
});

test("maxFiles caps the walk and warns", async () => {
  const root = await tempRoot();
  for (let i = 0; i < 6; i += 1) {
    await put(root, `file-${i}.swf`, buildSwf({ width: 100 + i, height: 100 }));
  }
  const result = await scanFolder(root, { maxFiles: 2 });
  assert.equal(result.found, 2);
  assert.equal(result.capped, true);
  assert.equal(result.maxFiles, 2);
  assert.ok(result.warnings.some((warning) => /limit/i.test(warning)));
});

test("the scan reads only a bounded prefix of large files", async () => {
  const root = await tempRoot();
  const large = buildSwf({
    width: 550,
    height: 400,
    tags: [metadataTag({ title: "Large file", description: "x".repeat(120000) })],
  });
  await put(root, "large.swf", large);

  const result = await scanFolder(root, { maxReadBytes: 2048 });
  assert.equal(result.found, 1);
  const record = result.files[0];
  assert.equal(record.width, 550);
  assert.equal(record.height, 400);
  assert.equal(record.truncated, true);
  assert.ok(record.size > 120000);
});

test("onProgress reports discovered files", async () => {
  const root = await tempRoot();
  await put(root, "one.swf", buildSwf());
  await put(root, "two.swf", buildSwf());
  const seen = [];
  await scanFolder(root, { onProgress: ({ found, file }) => seen.push({ found, file }) });
  assert.equal(seen.length, 2);
  assert.deepEqual(seen.map((item) => item.found), [1, 2]);
  assert.ok(seen.every((item) => typeof item.file === "string"));
});

test("invalid roots fail with a clear error", async () => {
  const root = await tempRoot();
  await assert.rejects(() => scanFolder(path.join(root, "does-not-exist")), /Folder not found/i);
  const file = await put(root, "plain.txt", "hello");
  await assert.rejects(() => scanFolder(file), /Not a folder/i);
});

test("symlink loops are skipped when following is enabled", async (t) => {
  const root = await tempRoot();
  await put(root, "sub/movie.swf", buildSwf());
  let linked = true;
  try {
    await symlink(root, path.join(root, "sub", "loop"), "junction");
  } catch {
    try {
      await symlink(root, path.join(root, "sub", "loop"), "dir");
    } catch {
      linked = false;
    }
  }
  if (!linked) {
    t.skip("symlinks are not available in this environment");
    return;
  }
  const result = await scanFolder(root, { follow: true });
  assert.equal(result.found, 1);
  assert.ok(result.warnings.some((warning) => /loop/i.test(warning)));
});

test("symlinks are ignored unless --follow is set", async (t) => {
  const root = await tempRoot();
  const outside = await tempRoot("swfbox-outside-");
  await put(outside, "external.swf", buildSwf({ width: 222, height: 111 }));
  let linked = true;
  try {
    await symlink(outside, path.join(root, "linked"), "junction");
  } catch {
    try {
      await symlink(outside, path.join(root, "linked"), "dir");
    } catch {
      linked = false;
    }
  }
  if (!linked) {
    t.skip("symlinks are not available in this environment");
    return;
  }

  const without = await scanFolder(root);
  assert.equal(without.found, 0);

  const withFollow = await scanFolder(root, { follow: true });
  assert.equal(withFollow.found, 1);
  assert.equal(withFollow.files[0].relativePath, "linked/external.swf");
});
