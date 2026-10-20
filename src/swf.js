/**
 * A small, defensive SWF reader.
 *
 * This is intentionally a *metadata* parser, not a renderer. It understands the
 * SWF header (FWS / CWS / ZWS), the bit-packed stage RECT, the frame rate and
 * count, and walks the top-level tag stream looking for the handful of tags that
 * tell us what a file is (AS2/AS3, background colour, embedded XMP metadata,
 * asset counts).
 *
 * Every byte is treated as hostile. A malformed file produces a record with an
 * `error` string instead of an exception.
 */

import { open, stat } from "node:fs/promises";
import { constants as zlibConstants, inflateSync } from "node:zlib";
import { round2, xmlText } from "./util.js";

export const DEFAULT_LIMITS = Object.freeze({
  /** Refuse to inflate a CWS body beyond this many bytes. */
  maxDecompressedBytes: 16 * 1024 * 1024,
  /** Stop after this many top-level tags. */
  maxTags: 5000,
  /** Never read more than this from a single file during a scan. */
  maxReadBytes: 4 * 1024 * 1024,
  /** A single tag longer than this is treated as corrupt. */
  maxTagLength: 16 * 1024 * 1024,
});

const TAG = Object.freeze({
  END: 0,
  SHOW_FRAME: 1,
  DEFINE_SHAPE: 2,
  SET_BACKGROUND_COLOR: 9,
  DO_ACTION: 12,
  DEFINE_SOUND: 14,
  DEFINE_SHAPE2: 22,
  DEFINE_SHAPE3: 32,
  DEFINE_SPRITE: 39,
  DO_INIT_ACTION: 59,
  DEFINE_VIDEO_STREAM: 60,
  FILE_ATTRIBUTES: 69,
  METADATA: 77,
  DO_ABC: 82,
  DEFINE_SHAPE4: 83,
});

const SHAPE_TAGS = new Set([
  TAG.DEFINE_SHAPE,
  TAG.DEFINE_SHAPE2,
  TAG.DEFINE_SHAPE3,
  TAG.DEFINE_SHAPE4,
]);

const SIGNATURES = new Set(["FWS", "CWS", "ZWS"]);

function normaliseLimits(overrides) {
  const limits = { ...DEFAULT_LIMITS };
  if (overrides && typeof overrides === "object") {
    for (const [key, value] of Object.entries(overrides)) {
      if (key in limits && Number.isFinite(value) && value > 0) limits[key] = Math.floor(value);
    }
  }
  return limits;
}

/** MSB-first bit reader, as required by the SWF RECT layout. */
class BitReader {
  constructor(buffer, byteOffset = 0) {
    this.buffer = buffer;
    this.bit = byteOffset * 8;
    this.limit = buffer.length * 8;
  }

  readUB(count) {
    if (count === 0) return 0;
    if (count < 0 || count > 32) throw new RangeError("Invalid bit count");
    if (this.bit + count > this.limit) throw new RangeError("Unexpected end of bit stream");
    let value = 0;
    for (let i = 0; i < count; i += 1) {
      const byte = this.buffer[this.bit >> 3];
      const bit = (byte >> (7 - (this.bit & 7))) & 1;
      value = value * 2 + bit;
      this.bit += 1;
    }
    return value >>> 0;
  }

  /** Two's complement signed integer of `count` bits. */
  readSB(count) {
    if (count === 0) return 0;
    const raw = this.readUB(count);
    if (count === 32) return raw | 0;
    const sign = 1 << (count - 1);
    return (raw & sign) !== 0 ? raw - (1 << count) : raw;
  }

  byteAlign() {
    this.bit = Math.ceil(this.bit / 8) * 8;
  }

  get byteOffset() {
    return Math.ceil(this.bit / 8);
  }
}

/** Read the bit-packed stage rectangle. */
export function parseRect(buffer, offset = 0) {
  const reader = new BitReader(buffer, offset);
  const nbits = reader.readUB(5);
  if (nbits === 0) {
    reader.byteAlign();
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0, widthTwips: 0, heightTwips: 0, byteLength: reader.byteOffset - offset };
  }
  if (nbits > 31) throw new RangeError(`Invalid RECT bit width (${nbits})`);
  const xMin = reader.readSB(nbits);
  const xMax = reader.readSB(nbits);
  const yMin = reader.readSB(nbits);
  const yMax = reader.readSB(nbits);
  reader.byteAlign();
  const widthTwips = Math.max(0, xMax - xMin);
  const heightTwips = Math.max(0, yMax - yMin);
  return {
    xMin,
    xMax,
    yMin,
    yMax,
    widthTwips,
    heightTwips,
    byteLength: reader.byteOffset - offset,
  };
}

function baseRecord(path, size) {
  return {
    path,
    size,
    signature: null,
    version: null,
    fileLength: null,
    compression: null,
    width: null,
    height: null,
    twips: null,
    frameRate: null,
    frameCount: null,
    asVersion: null,
    hasMetadata: false,
    metadata: { title: null, creator: null, description: null },
    tagCount: 0,
    spriteCount: 0,
    shapeCount: 0,
    soundCount: 0,
    videoCount: 0,
    backgroundColor: null,
    useNetwork: false,
    truncated: false,
    error: null,
  };
}

function failure(path, size, message, partial = {}) {
  return { ...baseRecord(path, size), ...partial, error: message };
}

function readAttribute(description, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const doubleQuoted = new RegExp(`\\b${escaped}\\s*=\\s*"([^"]*)"`, "i");
  const singleQuoted = new RegExp(`\\b${escaped}\\s*=\\s*'([^']*)'`, "i");
  const match = doubleQuoted.exec(description) || singleQuoted.exec(description);
  return match ? xmlText(match[1]) : null;
}

function readElement(xml, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)</${escaped}>`, "i").exec(xml);
  if (!match) return null;
  const inner = match[1];
  const listItems = [...inner.matchAll(/<rdf:li\b[^>]*>([\s\S]*?)<\/rdf:li>/gi)].map((item) => xmlText(item[1]));
  if (listItems.length > 0) {
    return listItems.filter((item) => item.length > 0).join(", ") || null;
  }
  return xmlText(inner) || null;
}

/**
 * Pull Dublin Core fields out of an XMP packet. This is a deliberately small
 * reader: no XML parser, no namespaces, just the shapes XMP actually uses.
 */
export function parseXmp(xml) {
  const metadata = { title: null, creator: null, description: null };
  if (typeof xml !== "string" || xml.length === 0) return metadata;

  const descriptions = [...xml.matchAll(/<rdf:Description\b[^>]*>/gi)].map((match) => match[0]);
  const combined = descriptions.join("\n");

  metadata.title = readElement(xml, "dc:title") || readAttribute(combined, "dc:title") || readAttribute(combined, "title");
  metadata.creator =
    readElement(xml, "dc:creator") || readAttribute(combined, "dc:creator") || readAttribute(combined, "creator");
  metadata.description =
    readElement(xml, "dc:description") ||
    readAttribute(combined, "dc:description") ||
    readAttribute(combined, "description");

  return metadata;
}

function metadataFromPayload(payload) {
  if (payload.length === 0) return { metadata: null, hasMetadata: false };
  const nul = payload.indexOf(0);
  const slice = nul === -1 ? payload : payload.subarray(0, nul);
  let text;
  try {
    text = slice.toString("utf8");
  } catch {
    return { metadata: null, hasMetadata: true };
  }
  text = text.replace(/^\uFEFF/, "").trim();
  if (text.length === 0) return { metadata: null, hasMetadata: true };
  if (!text.includes("<")) return { metadata: null, hasMetadata: true };
  return { metadata: parseXmp(text), hasMetadata: true };
}

function handleTag(code, payload, state) {
  switch (code) {
    case TAG.SET_BACKGROUND_COLOR: {
      if (payload.length >= 3) {
        const hex = [payload[0], payload[1], payload[2]].map((n) => n.toString(16).padStart(2, "0")).join("");
        state.backgroundColor = `#${hex}`;
      }
      break;
    }
    case TAG.FILE_ATTRIBUTES: {
      if (payload.length >= 4) {
        const flags = payload.readUInt32LE(0);
        state.useNetwork = (flags & 0x01) !== 0;
        if ((flags & 0x08) !== 0) state.sawAs3Flag = true;
        if ((flags & 0x10) !== 0) state.sawMetadataFlag = true;
      }
      break;
    }
    case TAG.METADATA: {
      const parsed = metadataFromPayload(payload);
      state.hasMetadata = state.hasMetadata || parsed.hasMetadata;
      if (parsed.metadata) state.metadata = parsed.metadata;
      break;
    }
    case TAG.DO_ABC:
      state.sawDoAbc = true;
      break;
    case TAG.DO_ACTION:
    case TAG.DO_INIT_ACTION:
      state.sawAs2Action = true;
      break;
    case TAG.DEFINE_SPRITE:
      state.spriteCount += 1;
      break;
    case TAG.DEFINE_SOUND:
      state.soundCount += 1;
      break;
    case TAG.DEFINE_VIDEO_STREAM:
      state.videoCount += 1;
      break;
    default:
      if (SHAPE_TAGS.has(code)) state.shapeCount += 1;
      break;
  }
}

function defaultState() {
  return {
    metadata: { title: null, creator: null, description: null },
    hasMetadata: false,
    sawMetadataFlag: false,
    sawAs3Flag: false,
    sawDoAbc: false,
    sawAs2Action: false,
    tagCount: 0,
    spriteCount: 0,
    shapeCount: 0,
    soundCount: 0,
    videoCount: 0,
    backgroundColor: null,
    useNetwork: false,
    truncated: false,
    error: null,
    frameRate: null,
    frameCount: null,
    width: null,
    height: null,
    twips: null,
  };
}

/** Walk the top-level tag stream. Returns the mutated state. */
function readTags(body, startOffset, limits, state) {
  let offset = startOffset;
  while (offset + 2 <= body.length) {
    if (state.tagCount >= limits.maxTags) break;

    const header = body.readUInt16LE(offset);
    offset += 2;
    const code = header >>> 6;
    let length = header & 0x3f;

    if (code === TAG.END) break;

    if (length === 0x3f) {
      if (offset + 4 > body.length) {
        state.truncated = true;
        break;
      }
      length = body.readUInt32LE(offset);
      offset += 4;
    }

    if (length > limits.maxTagLength || length > body.length - offset) {
      state.truncated = true;
      break;
    }

    handleTag(code, body.subarray(offset, offset + length), state);
    offset += length;
    state.tagCount += 1;
  }
  return state;
}

function finalise(record, state) {
  record.frameRate = state.frameRate;
  record.frameCount = state.frameCount;
  record.width = state.width;
  record.height = state.height;
  record.twips = state.twips;
  record.backgroundColor = state.backgroundColor;
  record.tagCount = state.tagCount;
  record.spriteCount = state.spriteCount;
  record.shapeCount = state.shapeCount;
  record.soundCount = state.soundCount;
  record.videoCount = state.videoCount;
  record.metadata = state.metadata;
  record.hasMetadata = state.hasMetadata || state.sawMetadataFlag;
  record.useNetwork = state.useNetwork;
  record.truncated = state.truncated;
  record.asVersion = state.sawDoAbc || state.sawAs3Flag ? 3 : state.sawAs2Action ? 2 : null;
  record.error = state.error;
  return record;
}

/**
 * Parse an in-memory SWF. `options.size` should be the real file size when the
 * buffer is only a prefix.
 */
export function parseSwfBuffer(buffer, options = {}) {
  const limits = normaliseLimits(options.limits);
  const filePath = options.path ?? null;
  const size = Number.isFinite(options.size) ? options.size : buffer.length;

  if (!Buffer.isBuffer(buffer)) {
    return failure(filePath, size, "Internal error: expected a Buffer");
  }

  if (buffer.length === 0) {
    return failure(filePath, 0, "Empty file — not a SWF (0 bytes)");
  }

  if (buffer.length < 8) {
    return failure(filePath, size, `Truncated SWF header (${buffer.length} bytes; need at least 8)`);
  }

  const signature = buffer.subarray(0, 3).toString("latin1");
  if (!SIGNATURES.has(signature)) {
    const shown = signature.replace(/[^\x20-\x7e]/g, "?");
    return failure(filePath, size, `Not an SWF file — expected FWS, CWS or ZWS signature, found "${shown}"`, {
      signature: shown,
    });
  }

  const version = buffer[3];
  const fileLength = buffer.readUInt32LE(4);

  if (fileLength < 8) {
    return failure(filePath, size, `Invalid SWF header — FileLength is ${fileLength}, smaller than the 8-byte header`, {
      signature,
      version,
      fileLength,
    });
  }

  // For FWS, FileLength is the real file size. For CWS and ZWS it is the
  // *uncompressed* size, so a small compressed file is perfectly normal.
  const truncated = (signature === "FWS" && size < fileLength) || Boolean(options.truncatedInput);
  const record = baseRecord(filePath, size);
  record.signature = signature;
  record.version = version;
  record.fileLength = fileLength;
  record.truncated = truncated;

  if (signature === "ZWS") {
    record.compression = "lzma";
    record.error =
      "LZMA-compressed SWF (ZWS) is not supported by swfbox — re-save it as FWS/CWS or open it directly in Ruffle";
    return record;
  }

  let body;
  if (signature === "FWS") {
    record.compression = "none";
    const declaredBody = fileLength - 8;
    const availableBody = buffer.length - 8;
    const bodyLength = Math.min(declaredBody > 0 ? declaredBody : availableBody, availableBody);
    body = buffer.subarray(8, 8 + bodyLength);
  } else {
    record.compression = "zlib";
    const compressed = buffer.subarray(8);
    try {
      body = inflateSync(compressed, { maxOutputLength: limits.maxDecompressedBytes });
    } catch (error) {
      if (error && error.code === "ERR_BUFFER_TOO_LARGE") {
        record.error = `Decompressed SWF exceeds the ${Math.round(
          limits.maxDecompressedBytes / (1024 * 1024),
        )} MB safety limit`;
        return record;
      }
      // A prefix of a large file (or a truncated stream) rarely reaches the
      // zlib trailer. Retry in sync-flush mode to salvage the readable prefix.
      try {
        body = inflateSync(compressed, {
          finishFlush: zlibConstants.Z_SYNC_FLUSH,
          maxOutputLength: limits.maxDecompressedBytes,
        });
        if (!body || body.length === 0) throw error;
        record.truncated = true;
      } catch {
        record.error = truncated
          ? "Could not decompress the CWS body — the compressed stream is truncated or corrupt"
          : `Could not decompress the CWS body (${error?.code || "corrupt zlib stream"})`;
        return record;
      }
    }
    if (!body || body.length === 0) {
      record.error = "CWS body decompressed to 0 bytes";
      return record;
    }
    if (truncated || body.length + 8 < fileLength) record.truncated = true;
  }

  if (body.length === 0) {
    record.error = "SWF has no body after the 8-byte header";
    return record;
  }

  try {
    const rect = parseRect(body, 0);
    const afterRect = rect.byteLength;
    if (afterRect + 4 > body.length) {
      record.error = "Truncated SWF — missing frame rate or frame count after the stage rectangle";
      record.truncated = true;
      return record;
    }
    const frameRateRaw = body.readUInt16LE(afterRect);
    const frameCount = body.readUInt16LE(afterRect + 2);

    const state = defaultState();
    state.frameRate = round2(frameRateRaw / 256);
    state.frameCount = frameCount;
    state.width = round2(rect.widthTwips / 20);
    state.height = round2(rect.heightTwips / 20);
    state.twips = { width: rect.widthTwips, height: rect.heightTwips };
    state.truncated = record.truncated;

    readTags(body, afterRect + 4, limits, state);
    finalise(record, state);
    return record;
  } catch (error) {
    record.error = `Malformed SWF body — ${error?.message || "could not read header"}`;
    record.truncated = true;
    return record;
  }
}

async function readPrefix(filePath, byteLimit) {
  const handle = await open(filePath, "r");
  try {
    const chunks = [];
    let total = 0;
    const chunkSize = 1024 * 256;
    while (total < byteLimit) {
      const want = Math.min(chunkSize, byteLimit - total);
      const buffer = Buffer.allocUnsafe(want);
      const { bytesRead } = await handle.read(buffer, 0, want, total);
      if (bytesRead === 0) break;
      chunks.push(buffer.subarray(0, bytesRead));
      total += bytesRead;
    }
    return Buffer.concat(chunks, total);
  } finally {
    await handle.close();
  }
}

/**
 * Read only the useful prefix of a file, then parse it. This is what scanning
 * uses so a folder full of 200 MB SWFs does not become a folder full of memory.
 */
export async function parseSwfFile(filePath, options = {}) {
  const limits = normaliseLimits(options.limits);
  let info;
  try {
    info = await stat(filePath);
  } catch (error) {
    const code = error?.code;
    const message =
      code === "ENOENT"
        ? "File not found"
        : code === "EACCES" || code === "EPERM"
          ? "Permission denied while reading file"
          : `Could not stat file (${code || "unknown error"})`;
    return failure(filePath, 0, message);
  }

  if (!info.isFile()) {
    return failure(filePath, 0, "Not a regular file");
  }

  if (info.size === 0) {
    return failure(filePath, 0, "Empty file — not a SWF (0 bytes)");
  }

  const requestedRead = options.maxReadBytes ?? limits.maxReadBytes;
  const maxRead = Number.isFinite(requestedRead) && requestedRead >= 8 ? Math.floor(requestedRead) : limits.maxReadBytes;
  const prefixLimit = Math.max(8, Math.min(info.size, maxRead));
  let buffer;
  try {
    buffer = await readPrefix(filePath, prefixLimit);
  } catch (error) {
    const code = error?.code;
    const message =
      code === "EACCES" || code === "EPERM"
        ? "Permission denied while reading file"
        : `Could not read file (${code || "unknown error"})`;
    return failure(filePath, info.size, message);
  }

  return parseSwfBuffer(buffer, {
    ...options,
    path: filePath,
    size: info.size,
    truncatedInput: info.size > buffer.length,
  });
}
