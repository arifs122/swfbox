/**
 * Ruffle resolution and the one explicit network operation swfbox supports.
 *
 * Ruffle is the emulator. swfbox never reimplements Flash; it only finds a
 * Ruffle build, serves it, and points a <ruffle-player> at a SWF.
 *
 * Resolution order (first match wins):
 *   1. --ruffle <path|url>
 *   2. <root>/.swfbox/ruffle
 *   3. <home>/.swfbox/ruffle
 *   4. the pinned unpkg CDN URL (serve/play only)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import {
  DEFAULT_RUFFLE_URL,
  RUFFLE_LICENSE,
  RUFFLE_NPM_TARBALL,
  RUFFLE_VERSION,
  encodePathSegments,
  isHttpUrl,
  toPosix,
} from "./util.js";

export const RUFFLE_SCRIPT = "ruffle.js";
const MAX_DOWNLOAD_BYTES = 60 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 256 * 1024 * 1024;

export function ruffleLabel(ruffle) {
  if (!ruffle) return "not configured";
  if (ruffle.kind === "local") return "local build";
  if (ruffle.kind === "cdn") return `unpkg CDN v${RUFFLE_VERSION}`;
  return "custom URL";
}

async function isFile(target) {
  try {
    const info = await stat(target);
    return info.isFile();
  } catch {
    return false;
  }
}

/** Locate ruffle.js inside a directory (supports a few common layouts). */
export async function findRuffleBuild(directory) {
  const candidates = [
    ["ruffle.js", directory],
    [path.join("package", "ruffle.js"), path.join(directory, "package")],
    [path.join("web", "ruffle.js"), path.join(directory, "web")],
  ];
  for (const [relative, base] of candidates) {
    const absolute = path.join(directory, relative);
    if (await isFile(absolute)) {
      return { dir: base, script: path.basename(relative), absolute };
    }
  }
  return null;
}

/**
 * @param {object} options
 * @param {string|null} [options.explicit] --ruffle value
 * @param {string} [options.root] scanned root
 * @param {"serve"|"static"} [options.mode="serve"]
 * @param {string} [options.outputDir] directory for a static report
 * @param {boolean} [options.allowCdn] fall back to the pinned CDN
 * @returns {Promise<{kind:string,url:string,dir?:string,script?:string,source:string}|null>}
 */
export async function resolveRuffle(options = {}) {
  const mode = options.mode === "static" ? "static" : "serve";
  const root = options.root ? path.resolve(options.root) : process.cwd();
  const outputDir = options.outputDir ? path.resolve(options.outputDir) : process.cwd();
  const explicit = options.explicit ? String(options.explicit).trim() : "";

  const localResult = async (directory, source) => {
    const build = await findRuffleBuild(directory);
    if (!build) return null;
    let url;
    if (mode === "serve") {
      url = `/ruffle/${encodePathSegments(toPosix(path.relative(build.dir, build.absolute)))}`;
    } else {
      const relative = path.relative(outputDir, build.absolute);
      if (path.isAbsolute(relative) || /^[A-Za-z]:/.test(relative)) {
        url = pathToFileURL(build.absolute).href;
      } else {
        url = encodePathSegments(relative);
      }
    }
    return { kind: "local", url, dir: build.dir, script: build.script, source, absolute: build.absolute };
  };

  if (explicit) {
    if (isHttpUrl(explicit)) {
      return { kind: "url", url: explicit, source: "--ruffle", label: "custom URL" };
    }
    let target = explicit;
    if (target === "~") target = homedir();
    else if (target.startsWith("~/") || target.startsWith("~\\")) target = path.join(homedir(), target.slice(2));
    target = path.resolve(target);

    const info = await stat(target).catch(() => null);
    if (!info) throw new Error(`Ruffle path not found: ${target}`);

    if (info.isFile()) {
      if (!/\.js$/i.test(target)) throw new Error(`--ruffle must point to a Ruffle folder or ruffle.js file: ${target}`);
      let url;
      if (mode === "serve") {
        url = `/ruffle/${encodePathSegments(path.basename(target))}`;
      } else {
        const relative = path.relative(outputDir, target);
        url = path.isAbsolute(relative) || /^[A-Za-z]:/.test(relative) ? pathToFileURL(target).href : encodePathSegments(relative);
      }
      return { kind: "local", url, dir: path.dirname(target), script: path.basename(target), source: "--ruffle", absolute: target };
    }

    if (!info.isDirectory()) throw new Error(`--ruffle is neither a file nor a folder: ${target}`);
    const found = await localResult(target, "--ruffle");
    if (!found) {
      throw new Error(`No ruffle.js found in ${target} — expected ruffle.js (or package/ruffle.js)`);
    }
    return found;
  }

  const scanned = await localResult(path.join(root, ".swfbox", "ruffle"), "root .swfbox/ruffle");
  if (scanned) return scanned;

  const home = path.join(homedir(), ".swfbox", "ruffle");
  if (path.resolve(home) !== path.resolve(root, ".swfbox", "ruffle")) {
    const fromHome = await localResult(home, "home .swfbox/ruffle");
    if (fromHome) return fromHome;
  }

  if (options.allowCdn) {
    return { kind: "cdn", url: DEFAULT_RUFFLE_URL, source: "default CDN", label: ruffleLabel({ kind: "cdn" }) };
  }

  return null;
}

function cString(buffer, start, length) {
  const slice = buffer.subarray(start, start + length);
  const zero = slice.indexOf(0);
  return (zero === -1 ? slice : slice.subarray(0, zero)).toString("utf8");
}

function parseOctal(buffer, start, length) {
  const text = cString(buffer, start, length).trim();
  if (!text) return 0;
  const value = Number.parseInt(text, 8);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Minimal ustar reader. Rejects absolute paths, traversal and links. */
export function extractTarGz(archive, targetDir) {
  const tar = gunzipSync(archive, { maxOutputLength: MAX_EXTRACTED_BYTES });
  const written = [];
  let offset = 0;
  let extractedBytes = 0;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;

    let name = cString(header, 0, 100);
    const prefix = cString(header, 345, 155);
    if (prefix) name = `${prefix}/${name}`;
    const size = parseOctal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 48);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) throw new Error("Corrupt Ruffle archive — truncated tar entry");

    offset = dataStart + Math.ceil(size / 512) * 512;

    if (type === "x" || type === "g" || type === "L" || type === "K") continue;
    if (type === "2" || type === "1") continue;
    if (type === "5") continue;

    let relative = name.replace(/\\/g, "/");
    if (relative.startsWith("package/")) relative = relative.slice("package/".length);
    if (!relative || relative.endsWith("/")) continue;
    if (relative.startsWith("/") || /^[A-Za-z]:/.test(relative) || relative.split("/").includes("..")) {
      throw new Error(`Refusing unsafe path in Ruffle archive: ${name}`);
    }

    const destination = path.join(targetDir, ...relative.split("/"));
    const resolved = path.resolve(destination);
    if (!resolved.startsWith(path.resolve(targetDir) + path.sep)) {
      throw new Error(`Refusing path outside the Ruffle folder: ${name}`);
    }

    extractedBytes += size;
    if (extractedBytes > MAX_EXTRACTED_BYTES) throw new Error("Ruffle archive expands beyond the safety limit");

    mkdirSyncSafe(path.dirname(destination));
    writeFileSyncSafe(destination, tar.subarray(dataStart, dataEnd));
    written.push(relative);
  }

  return written;
}

// Small synchronous helpers keep the tight tar loop simple; they are only used
// during an explicit --fetch-ruffle operation.
function mkdirSyncSafe(directory) {
  mkdirSync(directory, { recursive: true });
}
function writeFileSyncSafe(file, buffer) {
  writeFileSync(file, buffer);
}

function download(url, { timeoutMs, maxBytes, onProgress }, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error("Too many redirects while downloading Ruffle"));
      return;
    }
    const client = url.startsWith("https:") ? httpsGet : httpGet;
    const request = client(
      url,
      { headers: { "user-agent": "swfbox/0.1.0 (+https://github.com/arifs122/swfbox)", accept: "application/octet-stream" } },
      (response) => {
        const status = response.statusCode || 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          const next = new URL(response.headers.location, url).toString();
          download(next, { timeoutMs, maxBytes, onProgress }, redirects + 1).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(new Error(`Ruffle download failed with HTTP ${status}`));
          return;
        }
        const length = Number(response.headers["content-length"] || 0);
        if (length > maxBytes) {
          response.destroy();
          reject(new Error(`Ruffle download is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB limit`));
          return;
        }
        const chunks = [];
        let received = 0;
        response.on("data", (chunk) => {
          received += chunk.length;
          if (received > maxBytes) {
            response.destroy();
            reject(new Error(`Ruffle download exceeded the ${Math.round(maxBytes / (1024 * 1024))} MB limit`));
            return;
          }
          chunks.push(chunk);
          if (onProgress) onProgress({ received, total: length });
        });
        response.on("end", () => resolve(Buffer.concat(chunks, received)));
        response.on("error", reject);
      },
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Ruffle download timed out after ${Math.round(timeoutMs / 1000)}s`));
    });
    request.on("error", reject);
  });
}

/**
 * Download the pinned @ruffle-rs/ruffle npm tarball and unpack it into
 * `<root>/.swfbox/ruffle`. Only called for --fetch-ruffle.
 */
export async function fetchRuffle(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const targetDir = path.join(root, ".swfbox", "ruffle");
  const staging = path.join(root, ".swfbox", `.ruffle-tmp-${process.pid}`);
  const timeoutMs = options.timeoutMs ?? 120000;
  const maxBytes = options.maxBytes ?? MAX_DOWNLOAD_BYTES;
  const onStatus = options.onStatus || (() => {});
  const onProgress = options.onProgress || (() => {});
  const sourceUrl = options.sourceUrl || RUFFLE_NPM_TARBALL;

  await mkdir(path.dirname(targetDir), { recursive: true });
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });

  try {
    onStatus(`Downloading Ruffle ${RUFFLE_VERSION} (${RUFFLE_LICENSE})…`);
    const archive = await download(sourceUrl, { timeoutMs, maxBytes, onProgress });
    onStatus("Unpacking Ruffle…");
    const files = extractTarGz(archive, staging);

    const script = path.join(staging, RUFFLE_SCRIPT);
    if (!(await isFile(script))) {
      throw new Error("Downloaded Ruffle archive did not contain ruffle.js");
    }
    const wasm = files.some((file) => file.endsWith(".wasm"));
    if (!wasm) throw new Error("Downloaded Ruffle archive did not contain a .wasm build");

    await rm(targetDir, { recursive: true, force: true });
    await mkdir(path.dirname(targetDir), { recursive: true });
    await rename(staging, targetDir);

    return {
      dir: targetDir,
      script: path.join(targetDir, RUFFLE_SCRIPT),
      files: files.length,
      version: RUFFLE_VERSION,
      license: RUFFLE_LICENSE,
      source: sourceUrl,
      note: "Ruffle is MIT OR Apache-2.0. swfbox only serves these files; it does not modify them.",
    };
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    throw new Error(
      `${error.message}. Manual alternative: download the Ruffle web build from https://github.com/ruffle-rs/ruffle/releases, unzip it, and pass --ruffle <folder>.`,
    );
  }
}
