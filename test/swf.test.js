import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, stat, writeFile } from "node:fs/promises";

import { parseRect, parseSwfBuffer, parseSwfFile, parseXmp } from "../src/swf.js";
import { stableStringify } from "../src/util.js";
import {
  absurdTag,
  backgroundColor,
  buildSwf,
  defineShape,
  defineSound,
  defineSprite,
  defineVideoStream,
  doAbc,
  doAction,
  doInitAction,
  fileAttributes,
  metadataTag,
  rect,
  tag,
  xmp,
} from "../test-support/swf-builder.js";

function fullSwf(overrides = {}) {
  return buildSwf({
    version: 10,
    width: 550,
    height: 400,
    fps: 24,
    frames: 7,
    tags: [
      backgroundColor(10, 11, 12),
      fileAttributes({ as3: true, metadata: true, network: true }),
      metadataTag({ title: "Neon & Bolt", creator: "Studio Flash", description: "A tiny test movie." }),
      doAbc(),
      defineSprite(2),
      defineShape(),
      defineSound(),
      defineVideoStream(),
    ],
    ...overrides,
  });
}

test("parses a complete FWS header, RECT, fps, frames and tags", () => {
  const buffer = fullSwf();
  const record = parseSwfBuffer(buffer);

  assert.equal(record.error, null);
  assert.equal(record.signature, "FWS");
  assert.equal(record.compression, "none");
  assert.equal(record.version, 10);
  assert.equal(record.fileLength, buffer.length);
  assert.equal(record.size, buffer.length);
  assert.equal(record.width, 550);
  assert.equal(record.height, 400);
  assert.deepEqual(record.twips, { width: 11000, height: 8000 });
  assert.equal(record.frameRate, 24);
  assert.equal(record.frameCount, 7);
  assert.equal(record.asVersion, 3);
  assert.equal(record.hasMetadata, true);
  assert.equal(record.metadata.title, "Neon & Bolt");
  assert.equal(record.metadata.creator, "Studio Flash");
  assert.equal(record.metadata.description, "A tiny test movie.");
  assert.equal(record.backgroundColor, "#0a0b0c");
  assert.equal(record.useNetwork, true);
  assert.equal(record.truncated, false);
  assert.equal(record.tagCount, 8);
  assert.equal(record.spriteCount, 1);
  assert.equal(record.shapeCount, 1);
  assert.equal(record.soundCount, 1);
  assert.equal(record.videoCount, 1);
});

test("RECT bit packing handles odd twips and signed origins", () => {
  const rectBuffer = rect({ width: 123.45, height: 67.89, xMin: -20, yMin: -40 });
  const parsed = parseRect(rectBuffer);
  assert.equal(parsed.widthTwips, 2469);
  assert.equal(parsed.heightTwips, 1358);
  assert.equal(parsed.xMin, -20);
  assert.equal(parsed.yMin, -40);

  const record = parseSwfBuffer(buildSwf({ width: 123.45, height: 67.89 }));
  assert.equal(record.width, 123.45);
  assert.equal(record.height, 67.9);
  assert.equal(record.twips.width, 2469);
});

test("frame rate is fixed 8.8 (24 fps is 0x1800)", () => {
  const buffer = buildSwf({ fps: 24 });
  // The last four bytes of the header area are frame rate + frame count.
  const bodyOffset = 8 + rect({ width: 550, height: 400 }).length;
  assert.equal(buffer.readUInt16LE(bodyOffset), 0x1800);
  assert.equal(parseSwfBuffer(buffer).frameRate, 24);

  const half = parseSwfBuffer(buildSwf({ fps: 23.5 }));
  assert.equal(half.frameRate, 23.5);

  const fractional = parseSwfBuffer(buildSwf({ fps: 29.97 }));
  assert.equal(fractional.frameRate, 29.97);
});

test("CWS is inflated and reports zlib compression", () => {
  const cws = buildSwf({
    signature: "CWS",
    width: 400,
    height: 300,
    fps: 12,
    frames: 3,
    tags: [backgroundColor(255, 0, 128), metadataTag({ title: "Compressed" }), doAction()],
  });
  const record = parseSwfBuffer(cws);
  assert.equal(record.error, null);
  assert.equal(record.signature, "CWS");
  assert.equal(record.compression, "zlib");
  assert.equal(record.width, 400);
  assert.equal(record.height, 300);
  assert.equal(record.frameRate, 12);
  assert.equal(record.frameCount, 3);
  assert.equal(record.asVersion, 2);
  assert.equal(record.metadata.title, "Compressed");
  assert.equal(record.backgroundColor, "#ff0080");
  assert.equal(record.truncated, false);
});

test("ZWS is reported gracefully without implementing LZMA", () => {
  const zws = buildSwf({ signature: "ZWS" });
  let record;
  assert.doesNotThrow(() => {
    record = parseSwfBuffer(zws);
  });
  assert.equal(record.signature, "ZWS");
  assert.equal(record.compression, "lzma");
  assert.equal(record.width, null);
  assert.equal(record.height, null);
  assert.equal(record.frameCount, null);
  assert.match(record.error, /LZMA/i);
  assert.match(record.error, /Ruffle|re-save/i);
});

test("AS2 detection via DoAction and DoInitAction", () => {
  const action = parseSwfBuffer(buildSwf({ tags: [doAction()] }));
  assert.equal(action.asVersion, 2);

  const init = parseSwfBuffer(buildSwf({ tags: [doInitAction()] }));
  assert.equal(init.asVersion, 2);

  const attributes = parseSwfBuffer(buildSwf({ tags: [fileAttributes({ as3: true })] }));
  assert.equal(attributes.asVersion, 3);

  const none = parseSwfBuffer(buildSwf({ tags: [backgroundColor(1, 2, 3)] }));
  assert.equal(none.asVersion, null);
});

test("XMP metadata uses elements, attributes and entities", () => {
  const fromAttributes = parseSwfBuffer(
    buildSwf({
      tags: [
        tag(
          77,
          Buffer.from(
            `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:title="Attr &amp; Title" dc:creator="Someone" dc:description="Desc"/></rdf:RDF></x:xmpmeta>\0`,
            "utf8",
          ),
        ),
      ],
    }),
  );
  assert.equal(fromAttributes.hasMetadata, true);
  assert.equal(fromAttributes.metadata.title, "Attr & Title");
  assert.equal(fromAttributes.metadata.creator, "Someone");
  assert.equal(fromAttributes.metadata.description, "Desc");

  const parsed = parseXmp(xmp({ title: "Tom & Jerry <3", creator: "A, B" }));
  assert.equal(parsed.title, "Tom & Jerry <3");
  assert.equal(parsed.creator, "A, B");
});

test("truncated header, empty file and wrong signature fail clearly", () => {
  const short = parseSwfBuffer(Buffer.from("FWS\x0a"));
  assert.match(short.error, /Truncated SWF header/i);
  assert.equal(short.width, null);

  const empty = parseSwfBuffer(Buffer.alloc(0));
  assert.match(empty.error, /Empty file/i);
  assert.equal(empty.size, 0);

  const wrong = parseSwfBuffer(Buffer.from("GIF89a--not-an-swf", "latin1"));
  assert.match(wrong.error, /Not an SWF file/i);
  assert.equal(wrong.signature, "GIF");

  const badLength = buildSwf({ fileLength: 4 });
  const bad = parseSwfBuffer(badLength);
  assert.match(bad.error, /FileLength/i);
});

test("corrupt zlib and an absurd tag length never throw", () => {
  const header = Buffer.alloc(8);
  header.write("CWS", 0, "latin1");
  header[3] = 10;
  header.writeUInt32LE(1000, 4);
  const corrupt = Buffer.concat([header, Buffer.from("this-is-not-zlib")]);
  let record;
  assert.doesNotThrow(() => {
    record = parseSwfBuffer(corrupt);
  });
  assert.equal(record.compression, "zlib");
  assert.match(record.error, /decompress/i);

  const absurd = parseSwfBuffer(
    buildSwf({
      tags: [absurdTag(1, 0xffffffff)],
      end: false,
    }),
  );
  assert.equal(absurd.width, 550);
  assert.equal(absurd.truncated, true);
  assert.equal(absurd.error, null);
  assert.equal(absurd.tagCount, 0);
});

test("truncated tag streams and short files are flagged", () => {
  const body = Buffer.concat([
    rect({ width: 320, height: 240 }),
    Buffer.from([0x00, 0x00, 0x01, 0x00]),
    Buffer.from([0x7f, 0x00]), // long tag header with no length
  ]);
  const partial = parseSwfBuffer(buildSwf({ bodyOverride: body, end: false }));
  assert.equal(partial.truncated, true);
  assert.equal(partial.width, 320);
  assert.equal(partial.frameCount, 1);

  const complete = buildSwf({ width: 200, height: 100, tags: [backgroundColor(0, 0, 0)] });
  const sliced = complete.subarray(0, complete.length - 5);
  const cut = parseSwfBuffer(sliced, { size: complete.length });
  assert.equal(cut.truncated, true);
  assert.equal(cut.width, 200);

  const declaredHuge = buildSwf({ fileLength: 999999 });
  assert.equal(parseSwfBuffer(declaredHuge).truncated, true);
});

test("a truncated CWS prefix salvages the header but marks truncation", () => {
  const complete = buildSwf({
    signature: "CWS",
    width: 320,
    height: 240,
    frames: 5,
    tags: [metadataTag({ title: "Cut short" })],
  });
  const cut = parseSwfBuffer(complete.subarray(0, Math.floor(complete.length * 0.7)), { size: complete.length });
  assert.equal(cut.error, null);
  assert.equal(cut.compression, "zlib");
  assert.equal(cut.width, 320);
  assert.equal(cut.height, 240);
  assert.equal(cut.truncated, true);
});

test("decompression cap stops zip bombs with a clear error", () => {
  const bomb = buildSwf({
    signature: "CWS",
    bodyOverride: Buffer.alloc(200000, 0x41),
  });
  const record = parseSwfBuffer(bomb, { limits: { maxDecompressedBytes: 512 } });
  assert.match(record.error, /safety limit/i);
  assert.equal(record.compression, "zlib");
});

test("parseSwfFile reads a real file and reports missing files", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "swfbox-swf-"));
  const file = path.join(dir, "hello.swf");
  await writeFile(file, fullSwf());

  const record = await parseSwfFile(file);
  assert.equal(record.error, null);
  assert.equal(record.path, file);
  assert.equal(record.size, (await stat(file)).size);
  assert.equal(record.metadata.title, "Neon & Bolt");

  const missing = await parseSwfFile(path.join(dir, "nope.swf"));
  assert.match(missing.error, /not found/i);
});

test("invalid limit overrides fall back to safe defaults", () => {
  const record = parseSwfBuffer(fullSwf(), {
    limits: { maxTags: undefined, maxDecompressedBytes: Number.NaN, maxReadBytes: -1 },
  });
  assert.equal(record.error, null);
  assert.equal(record.frameCount, 7);
  assert.equal(record.tagCount, 8);
});

test("record shape is stable, JSON-safe and sorted", () => {
  const record = parseSwfBuffer(fullSwf(), { path: "movie.swf" });
  const required = [
    "path",
    "size",
    "signature",
    "version",
    "fileLength",
    "compression",
    "width",
    "height",
    "frameRate",
    "frameCount",
    "asVersion",
    "hasMetadata",
    "metadata",
    "tagCount",
    "spriteCount",
    "shapeCount",
    "soundCount",
    "videoCount",
    "backgroundColor",
    "truncated",
    "error",
  ];
  for (const key of required) assert.ok(key in record, `missing ${key}`);
  for (const key of Object.keys(record)) assert.notEqual(record[key], undefined, `${key} is undefined`);

  const json = stableStringify(record);
  const parsed = JSON.parse(json);
  assert.equal(parsed.metadata.title, "Neon & Bolt");
  const keys = Object.keys(parsed);
  assert.deepEqual(keys, [...keys].sort());
});
