/**
 * Recursive, bounded folder scanner.
 *
 * The scanner never walks outside the requested root, never follows symlinks
 * unless asked, and reads at most `maxReadBytes` from each SWF. Broken files are
 * kept: an archive without a few unreadable files is not a real archive.
 */

import path from "node:path";
import { readdir, realpath, stat } from "node:fs/promises";
import { DEFAULT_LIMITS, parseSwfFile } from "./swf.js";
import { toPosix } from "./util.js";

export const DEFAULT_MAX_FILES = 5000;

export function isSwfName(name) {
  return typeof name === "string" && /\.swf$/i.test(name);
}

/**
 * @param {string} root directory to scan
 * @param {object} [options]
 * @param {number} [options.maxFiles=5000]
 * @param {boolean} [options.follow=false] follow directory symlinks
 * @param {number} [options.maxReadBytes]
 * @param {(progress: {found: number, file: string}) => void} [options.onProgress]
 */
export async function scanFolder(root, options = {}) {
  const started = Date.now();
  const absoluteRoot = path.resolve(root);
  const maxFiles = Number.isFinite(options.maxFiles) && options.maxFiles > 0 ? Math.floor(options.maxFiles) : DEFAULT_MAX_FILES;
  const follow = options.follow === true;
  const maxReadBytes = options.maxReadBytes ?? DEFAULT_LIMITS.maxReadBytes;
  const warnings = [];
  const files = [];
  const visited = new Set();
  let capped = false;

  let rootInfo;
  try {
    rootInfo = await stat(absoluteRoot);
  } catch (error) {
    throw new Error(
      error?.code === "ENOENT"
        ? `Folder not found: ${absoluteRoot}`
        : error?.code === "EACCES"
          ? `Permission denied: ${absoluteRoot}`
          : `Cannot access folder: ${absoluteRoot}`,
    );
  }
  if (!rootInfo.isDirectory()) throw new Error(`Not a folder: ${absoluteRoot}`);

  try {
    visited.add(await realpath(absoluteRoot));
  } catch {
    visited.add(absoluteRoot);
  }

  const queue = [absoluteRoot];
  while (queue.length > 0 && !capped) {
    const current = queue.shift();
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      warnings.push(
        `Could not read folder ${path.relative(absoluteRoot, current) || "."}: ${error?.code || "unknown error"}`,
      );
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name, "en"));

    for (const entry of entries) {
      if (capped) break;
      const fullPath = path.join(current, entry.name);
      const relative = toPosix(path.relative(absoluteRoot, fullPath));

      if (entry.isSymbolicLink() && !follow) continue;

      let kind = entry.isDirectory() ? "dir" : entry.isFile() ? "file" : "other";
      if (entry.isSymbolicLink()) {
        try {
          const info = await stat(fullPath);
          kind = info.isDirectory() ? "dir" : info.isFile() ? "file" : "other";
        } catch {
          warnings.push(`Broken symlink at ${relative}`);
          continue;
        }
      }

      if (kind === "dir") {
        if (entry.name.startsWith(".")) continue;
        let real;
        try {
          real = await realpath(fullPath);
        } catch {
          warnings.push(`Could not resolve ${relative}`);
          continue;
        }
        if (visited.has(real)) {
          warnings.push(`Skipped symlink loop at ${relative}`);
          continue;
        }
        visited.add(real);
        queue.push(fullPath);
        continue;
      }

      if (kind !== "file" || !isSwfName(entry.name)) continue;

      if (files.length >= maxFiles) {
        capped = true;
        warnings.push(`Reached the ${maxFiles} file limit — increase it with --max-files`);
        break;
      }

      let modified = null;
      try {
        const info = await stat(fullPath);
        modified = info.mtime.toISOString();
      } catch {
        modified = null;
      }

      const record = await parseSwfFile(fullPath, { maxReadBytes, limits: options.limits });
      record.relativePath = relative;
      record.name = entry.name;
      record.modified = modified;
      files.push(record);

      if (typeof options.onProgress === "function") {
        options.onProgress({ found: files.length, file: relative });
      }
    }
  }

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "en", { sensitivity: "base" }));

  return {
    root: absoluteRoot,
    files,
    warnings,
    capped,
    maxFiles,
    found: files.length,
    durationMs: Date.now() - started,
  };
}
