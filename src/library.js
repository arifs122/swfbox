/**
 * Turn a raw scan into the library model used by the HTML page, the server and
 * the terminal report. Keeping this in one place means the static page and the
 * live server can never disagree about counts or titles.
 */

import path from "node:path";
import { pathToFileURL } from "node:url";
import { encodePathSegments, formatBytes, toPosix } from "./util.js";

function titleFromName(name) {
  return String(name || "Untitled").replace(/\.swf$/i, "");
}

function classify(record) {
  if (record.error) return "broken";
  if (record.asVersion === 3) return "as3";
  if (record.asVersion === 2) return "as2";
  return "unknown";
}

function staticSource(outputDir, absoluteFile) {
  const relative = toPosix(path.relative(outputDir, absoluteFile));
  if (path.isAbsolute(relative) || /^[A-Za-z]:/.test(relative)) {
    return pathToFileURL(absoluteFile).href;
  }
  return encodePathSegments(relative);
}

/**
 * @param {Awaited<ReturnType<import("./scan.js").scanFolder>>} scan
 * @param {object} [options]
 * @param {"static"|"serve"} [options.mode="static"]
 * @param {string} [options.outputDir] directory that will contain the HTML
 * @param {object|null} [options.ruffle] resolved Ruffle descriptor
 * @param {"dark"|"light"} [options.theme="dark"]
 */
export function buildLibrary(scan, options = {}) {
  const mode = options.mode === "serve" ? "serve" : "static";
  const outputDir = options.outputDir ? path.resolve(options.outputDir) : process.cwd();

  const entries = scan.files.map((record) => {
    const relativePath = record.relativePath || path.basename(record.path || "");
    const encoded = encodePathSegments(relativePath);
    const broken = Boolean(record.error);
    const metadata = record.metadata || { title: null, creator: null, description: null };
    const title = (metadata.title && metadata.title.trim()) || titleFromName(record.name);
    return {
      ...record,
      relativePath,
      title,
      kind: classify(record),
      broken,
      src: mode === "serve" ? `/swf/${encoded}` : staticSource(outputDir, record.path),
      playerUrl:
        mode === "serve"
          ? `/player?f=${encodeURIComponent(relativePath)}`
          : null,
      sizeLabel: formatBytes(record.size),
      dimensions: record.width !== null && record.height !== null ? `${record.width} × ${record.height}` : null,
    };
  });

  const counts = {
    total: entries.length,
    readable: entries.filter((entry) => !entry.broken).length,
    broken: entries.filter((entry) => entry.broken).length,
    as3: entries.filter((entry) => entry.kind === "as3").length,
    as2: entries.filter((entry) => entry.kind === "as2").length,
    unknown: entries.filter((entry) => entry.kind === "unknown").length,
  };

  return {
    name: "swfbox",
    version: options.version || "0.1.0",
    mode,
    generatedAt: options.generatedAt || new Date().toISOString(),
    root: scan.root,
    rootName: path.basename(scan.root) || scan.root,
    entries,
    counts,
    totalBytes: entries.reduce((sum, entry) => sum + (Number(entry.size) || 0), 0),
    warnings: scan.warnings || [],
    capped: Boolean(scan.capped),
    maxFiles: scan.maxFiles,
    durationMs: scan.durationMs || 0,
    ruffle: options.ruffle || null,
    theme: options.theme === "light" ? "light" : "dark",
  };
}

export function findEntry(library, relativePath) {
  if (!relativePath) return null;
  const wanted = toPosix(relativePath).replace(/^\/+/, "");
  return library.entries.find((entry) => entry.relativePath === wanted) || null;
}
