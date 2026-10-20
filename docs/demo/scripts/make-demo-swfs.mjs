#!/usr/bin/env node
/**
 * Build the committed demo archive: ten tiny, synthetic SWFs in
 * docs/demo/swfs/, then regenerate docs/demo/demo.html and docs/demo/cli.txt.
 *
 * Deterministic by design: every byte is generated here, file mtimes are pinned
 * to 2009-05-01, and the library page uses a fixed generatedAt timestamp. No
 * fixtures are downloaded and no network is used.
 *
 * Run from anywhere:  node docs/demo/scripts/make-demo-swfs.mjs
 */

import { spawnSync } from "node:child_process";
import { mkdir, rm, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

import { buildLibrary } from "../../../src/library.js";
import { renderHtml } from "../../../src/render-html.js";
import { scanFolder } from "../../../src/scan.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const DEMO = path.resolve(HERE, "..");
const SWFS = path.join(DEMO, "swfs");
const FIXED_TIME = new Date("2009-05-01T12:00:00.000Z");
const FIXED_GENERATED = "2009-05-01T12:00:00.000Z";

/* ------------------------------------------------------------------ */
/* Minimal SWF writer                                                  */
/* ------------------------------------------------------------------ */

class BitWriter {
  constructor() {
    this.bits = [];
  }
  ub(value, count) {
    for (let i = count - 1; i >= 0; i -= 1) this.bits.push((value >>> i) & 1);
    return this;
  }
  sb(value, count) {
    return this.ub(value < 0 ? value + 2 ** count : value, count);
  }
  buffer() {
    while (this.bits.length % 8 !== 0) this.bits.push(0);
    const out = Buffer.alloc(this.bits.length / 8);
    this.bits.forEach((bit, index) => {
      if (bit) out[index >> 3] |= 1 << (7 - (index & 7));
    });
    return out;
  }
}

function signedBits(value) {
  for (let bits = 1; bits < 32; bits += 1) {
    if (value >= -(2 ** (bits - 1)) && value <= 2 ** (bits - 1) - 1) return bits;
  }
  return 32;
}

function rect(width, height) {
  const twipsX = Math.round(width * 20);
  const twipsY = Math.round(height * 20);
  const nbits = Math.max(signedBits(twipsX), signedBits(twipsY), 1);
  return new BitWriter().ub(nbits, 5).sb(0, nbits).sb(twipsX, nbits).sb(0, nbits).sb(twipsY, nbits).buffer();
}

function tag(code, payload = Buffer.alloc(0)) {
  if (payload.length < 0x3f) {
    const header = Buffer.alloc(2);
    header.writeUInt16LE((code << 6) | payload.length, 0);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE((code << 6) | 0x3f, 0);
  header.writeUInt32LE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

function background(r, g, b) {
  return tag(9, Buffer.from([r, g, b]));
}

function fileAttributes({ as3 = false, metadata = false } = {}) {
  const payload = Buffer.alloc(4);
  payload.writeUInt32LE((as3 ? 0x08 : 0) | (metadata ? 0x10 : 0), 0);
  return tag(69, payload);
}

function xmp({ title, creator, description }) {
  const esc = (value) =>
    String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(title)}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>${esc(creator)}</rdf:li></rdf:Seq></dc:creator>
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${esc(description)}</rdf:li></rdf:Alt></dc:description>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

function metadataTag(fields) {
  return tag(77, Buffer.from(`${xmp(fields)}\0`, "utf8"));
}

const doAction = () => tag(12, Buffer.from([0x81, 0x00, 0x00]));
const doAbc = () => tag(82, Buffer.from("synthetic-abc", "latin1"));
const sprite = () => {
  const payload = Buffer.alloc(4);
  payload.writeUInt16LE(1, 0);
  payload.writeUInt16LE(3, 2);
  return tag(39, payload);
};
const shape = () => tag(2, Buffer.alloc(8));
const sound = () => tag(14, Buffer.alloc(8));
const video = () => tag(60, Buffer.alloc(8));

function swf({ signature = "FWS", version = 10, width, height, fps, frames, tags = [] }) {
  const body = Buffer.concat([
    rect(width, height),
    (() => {
      const tail = Buffer.alloc(4);
      tail.writeUInt16LE(Math.round(fps * 256), 0);
      tail.writeUInt16LE(frames, 2);
      return tail;
    })(),
    ...tags,
    tag(0),
  ]);

  const header = Buffer.alloc(8);
  header.write(signature, 0, "latin1");
  header[3] = version;
  header.writeUInt32LE(8 + body.length, 4);

  if (signature === "CWS") return Buffer.concat([header, deflateSync(body)]);
  if (signature === "ZWS") {
    const compressedLength = Buffer.alloc(4);
    compressedLength.writeUInt32LE(body.length, 0);
    return Buffer.concat([header, compressedLength, Buffer.from([0x5d, 0, 0, 0x10, 0]), deflateSync(body)]);
  }
  return Buffer.concat([header, body]);
}

/* ------------------------------------------------------------------ */
/* The archive                                                         */
/* ------------------------------------------------------------------ */

const demoFiles = [
  {
    name: "Neon Bolt.swf",
    data: swf({
      width: 550,
      height: 400,
      fps: 24,
      frames: 12,
      tags: [
        background(11, 16, 32),
        fileAttributes({ as3: false, metadata: true }),
        metadataTag({
          title: "Neon Bolt",
          creator: "swfbox demo studio",
          description: "A tiny AS2 title card with a violet-to-cyan bolt. Generated, not downloaded.",
        }),
        doAction(),
        sprite(),
        shape(),
      ],
    }),
  },
  {
    name: "Space Cadet.swf",
    data: swf({
      signature: "CWS",
      version: 15,
      width: 800,
      height: 600,
      fps: 30,
      frames: 48,
      tags: [
        background(4, 7, 20),
        fileAttributes({ as3: true, metadata: true }),
        metadataTag({
          title: "Space Cadet",
          creator: "Orbital Office",
          description: "A compressed AS3 sample with sprites, shapes and sound tags.",
        }),
        doAbc(),
        sprite(),
        shape(),
        sound(),
      ],
    }),
  },
  {
    name: "Tiny Banner.swf",
    data: swf({
      width: 468,
      height: 60,
      fps: 12,
      frames: 1,
      tags: [background(255, 255, 255)],
    }),
  },
  {
    name: "Loading Loop.swf",
    data: swf({
      width: 320,
      height: 240,
      fps: 18,
      frames: 60,
      tags: [background(16, 12, 30), doAction(), sprite(), sound()],
    }),
  },
  {
    name: "Pocket Quiz.swf",
    data: swf({
      signature: "CWS",
      version: 12,
      width: 640,
      height: 480,
      fps: 30,
      frames: 90,
      tags: [
        background(24, 18, 48),
        fileAttributes({ as3: true, metadata: true }),
        metadataTag({
          title: "Pocket Quiz",
          creator: "Quiz Engine 2003",
          description: "Ninety frames of synthetic quiz data. No questions were harmed.",
        }),
        doAbc(),
        shape(),
      ],
    }),
  },
  {
    name: "Portrait Card.swf",
    data: swf({
      width: 240,
      height: 320,
      fps: 12,
      frames: 5,
      tags: [background(250, 244, 232), sprite(), shape()],
    }),
  },
  {
    name: "Widescreen Intro.swf",
    data: swf({
      signature: "CWS",
      version: 14,
      width: 1280,
      height: 720,
      fps: 25,
      frames: 10,
      tags: [
        background(2, 4, 12),
        fileAttributes({ as3: true, metadata: true }),
        metadataTag({
          title: "Widescreen Intro",
          creator: "Frame & Field",
          description: "A 16:9 AS3 intro with a video tag and an XMP packet.",
        }),
        doAbc(),
        video(),
        sprite(),
      ],
    }),
  },
  {
    name: "Retro Pixel.swf",
    data: swf({
      width: 100,
      height: 100,
      fps: 6,
      frames: 3,
      tags: [background(255, 0, 128), doAction()],
    }),
  },
  {
    name: "LZMA Bundle.swf",
    data: swf({ signature: "ZWS", width: 640, height: 480, fps: 24, frames: 20, tags: [] }),
  },
  {
    name: "Corrupt Legacy.swf",
    data: Buffer.concat([
      (() => {
        const header = Buffer.alloc(8);
        header.write("CWS", 0, "latin1");
        header[3] = 10;
        header.writeUInt32LE(4096, 4);
        return header;
      })(),
      Buffer.from("this compressed body did not survive the archive"),
    ]),
  },
];

/* ------------------------------------------------------------------ */
/* Write + render                                                      */
/* ------------------------------------------------------------------ */

await rm(SWFS, { recursive: true, force: true });
await mkdir(SWFS, { recursive: true });

for (const file of demoFiles) {
  const target = path.join(SWFS, file.name);
  await writeFile(target, file.data);
  await utimes(target, FIXED_TIME, FIXED_TIME);
}

const scan = await scanFolder(SWFS, { maxFiles: 50 });
const library = buildLibrary(
  { ...scan, root: "docs/demo/swfs" },
  {
    mode: "static",
    outputDir: DEMO,
    ruffle: null,
    theme: "dark",
    generatedAt: FIXED_GENERATED,
    version: "0.1.0",
  },
);
await writeFile(path.join(DEMO, "demo.html"), renderHtml(library), "utf8");

const run = (args) =>
  spawnSync(process.execPath, [path.join(ROOT, "bin", "swfbox.js"), ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });

const scanText = run(["docs/demo/swfs", "--format", "text", "--no-color"]);
const inspectGood = run(["inspect", "docs/demo/swfs/Neon Bolt.swf", "--no-color"]);
const inspectBroken = run(["inspect", "docs/demo/swfs/Corrupt Legacy.swf", "--no-color"]);

const transcript = [
  "$ node bin/swfbox.js docs/demo/swfs --format text --no-color",
  scanText.stdout.trimEnd(),
  "",
  '$ node bin/swfbox.js inspect "docs/demo/swfs/Neon Bolt.swf" --no-color',
  inspectGood.stdout.trimEnd(),
  "",
  '$ node bin/swfbox.js inspect "docs/demo/swfs/Corrupt Legacy.swf" --no-color',
  `${inspectBroken.stdout}${inspectBroken.stderr}`.trimEnd(),
  "",
].join("\n");

await writeFile(path.join(DEMO, "cli.txt"), transcript, "utf8");

process.stdout.write(
  `Wrote ${demoFiles.length} synthetic SWFs to ${path.relative(ROOT, SWFS)}\n` +
    `  demo.html  ${library.counts.total} files · ${library.counts.readable} readable · ${library.counts.broken} broken\n` +
    `  cli.txt    ${transcript.split("\n").length} lines\n`,
);
