/**
 * Synthetic SWF builder for tests and demos. Everything is generated; no
 * fixtures are downloaded. The output is byte-identical for identical input.
 */

import { deflateSync } from "node:zlib";

export class BitWriter {
  constructor() {
    this.bits = [];
  }

  writeUB(value, count) {
    for (let i = count - 1; i >= 0; i -= 1) this.bits.push((value >>> i) & 1);
    return this;
  }

  writeSB(value, count) {
    let raw = value;
    if (raw < 0) raw += 2 ** count;
    return this.writeUB(raw, count);
  }

  align() {
    while (this.bits.length % 8 !== 0) this.bits.push(0);
    return this;
  }

  toBuffer() {
    this.align();
    const out = Buffer.alloc(this.bits.length / 8);
    for (let i = 0; i < this.bits.length; i += 1) {
      if (this.bits[i]) out[i >> 3] |= 1 << (7 - (i & 7));
    }
    return out;
  }
}

export function signedBits(value) {
  for (let bits = 1; bits < 32; bits += 1) {
    const min = -(2 ** (bits - 1));
    const max = 2 ** (bits - 1) - 1;
    if (value >= min && value <= max) return bits;
  }
  return 32;
}

/** Build a RECT from pixel dimensions (or explicit twips). */
export function rect({ width = 550, height = 400, twips = null, xMin = 0, yMin = 0 } = {}) {
  const xMax = xMin + (twips ? twips.width : Math.round(width * 20));
  const yMax = yMin + (twips ? twips.height : Math.round(height * 20));
  const nbits = Math.max(signedBits(xMin), signedBits(xMax), signedBits(yMin), signedBits(yMax), 1);
  const writer = new BitWriter();
  writer.writeUB(nbits, 5);
  writer.writeSB(xMin, nbits);
  writer.writeSB(xMax, nbits);
  writer.writeSB(yMin, nbits);
  writer.writeSB(yMax, nbits);
  return writer.toBuffer();
}

export function tag(code, payload = Buffer.alloc(0)) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const length = data.length;
  if (length < 0x3f) {
    const header = Buffer.alloc(2);
    header.writeUInt16LE((code << 6) | length, 0);
    return Buffer.concat([header, data]);
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE((code << 6) | 0x3f, 0);
  header.writeUInt32LE(length, 2);
  return Buffer.concat([header, data]);
}

/** A deliberately corrupt tag header with an absurd 32-bit length. */
export function absurdTag(code = 1, length = 0xffffffff) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE((code << 6) | 0x3f, 0);
  header.writeUInt32LE(length, 2);
  return header;
}

export const END = tag(0, Buffer.alloc(0));
export const backgroundColor = (r, g, b) => tag(9, Buffer.from([r, g, b]));

export function fileAttributes({ as3 = false, metadata = false, network = false } = {}) {
  const flags = (as3 ? 0x08 : 0) | (metadata ? 0x10 : 0) | (network ? 0x01 : 0);
  const payload = Buffer.alloc(4);
  payload.writeUInt32LE(flags, 0);
  return tag(69, payload);
}

export const doAbc = () => tag(82, Buffer.from("abc", "latin1"));
export const doAction = () => tag(12, Buffer.from([0x81, 0x00, 0x00]));
export const doInitAction = () => tag(59, Buffer.from([0x00, 0x00]));
export const defineSprite = (id = 1) => {
  const payload = Buffer.alloc(4);
  payload.writeUInt16LE(id, 0);
  payload.writeUInt16LE(1, 2);
  return tag(39, payload);
};
export const defineShape = () => tag(2, Buffer.alloc(8));
export const defineSound = () => tag(14, Buffer.alloc(8));
export const defineVideoStream = () => tag(60, Buffer.alloc(8));

export function xmp({ title = null, creator = null, description = null } = {}) {
  const esc = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const alt = (value) =>
    `<rdf:Alt><rdf:li xml:lang="x-default">${esc(value)}</rdf:li></rdf:Alt>`;
  const seq = (value) => `<rdf:Seq><rdf:li>${esc(value)}</rdf:li></rdf:Seq>`;
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   ${title ? `<dc:title>${alt(title)}</dc:title>` : ""}
   ${creator ? `<dc:creator>${seq(creator)}</dc:creator>` : ""}
   ${description ? `<dc:description>${alt(description)}</dc:description>` : ""}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

export function metadataTag(fields) {
  return tag(77, Buffer.from(`${xmp(fields)}\0`, "utf8"));
}

/**
 * Build a complete SWF.
 * @param {object} options
 * @param {"FWS"|"CWS"|"ZWS"} [options.signature="FWS"]
 * @param {number} [options.version=10]
 * @param {number} [options.width=550]
 * @param {number} [options.height=400]
 * @param {number} [options.fps=24]
 * @param {number} [options.frames=2]
 * @param {Buffer[]} [options.tags]
 * @param {boolean} [options.end=true]
 * @param {number} [options.fileLength] override the header field
 */
export function buildSwf(options = {}) {
  const {
    signature = "FWS",
    version = 10,
    width = 550,
    height = 400,
    fps = 24,
    frames = 2,
    tags = [],
    end = true,
    fileLength: fileLengthOverride = null,
    bodyOverride = null,
  } = options;

  const body =
    bodyOverride ??
    Buffer.concat([
      rect({ width, height }),
      (() => {
        const tail = Buffer.alloc(4);
        tail.writeUInt16LE(Math.round(fps * 256), 0);
        tail.writeUInt16LE(frames, 2);
        return tail;
      })(),
      ...tags,
      ...(end ? [END] : []),
    ]);

  const header = Buffer.alloc(8);
  header.write(signature, 0, "latin1");
  header[3] = version;
  const declared = fileLengthOverride ?? 8 + body.length;
  header.writeUInt32LE(declared, 4);

  if (signature === "CWS") {
    return Buffer.concat([header, deflateSync(body)]);
  }
  if (signature === "ZWS") {
    const compressedLength = Buffer.alloc(4);
    compressedLength.writeUInt32LE(body.length, 0);
    const properties = Buffer.from([0x5d, 0x00, 0x00, 0x10, 0x00]);
    return Buffer.concat([header, compressedLength, properties, deflateSync(body)]);
  }
  return Buffer.concat([header, body]);
}

export function expectNoThrow(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error };
  }
}
