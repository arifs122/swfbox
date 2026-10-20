#!/usr/bin/env node
/**
 * swfbox command line.
 *
 * Three modes: build a static library page, serve a live library + player, or
 * inspect one file. All argument parsing is hand-rolled so the package can stay
 * dependency-free.
 */

import { spawn } from "node:child_process";
import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildLibrary } from "./library.js";
import { renderHtml } from "./render-html.js";
import { renderInspect, renderReportSummary, renderScanStart, renderTextList } from "./render-text.js";
import { fetchRuffle, resolveRuffle, ruffleLabel } from "./ruffle.js";
import { scanFolder } from "./scan.js";
import { startServer } from "./serve.js";
import { parseSwfFile } from "./swf.js";
import {
  DEFAULT_RUFFLE_URL,
  RUFFLE_VERSION,
  VERSION,
  formatBytes,
  makeColour,
  stableStringify,
  toPosix,
} from "./util.js";

const COMMANDS = new Set(["serve", "play", "inspect", "help", "version"]);
const FORMATS = new Set(["html", "json", "text"]);

export const HELP = `swfbox ${VERSION} — Your offline Flash library

Point it at a folder of .swf files. swfbox reads their metadata itself, builds
a browsable offline library, and plays them through Ruffle. It is not a Flash
emulator; Ruffle (https://ruffle.rs) does the playing.

Usage
  swfbox [dir]                     scan a folder and write swfbox-library.html
  swfbox serve [dir]               serve the library + player locally
  swfbox play <file.swf>           serve and open one file
  swfbox inspect <file.swf>        print the parsed metadata
  swfbox --fetch-ruffle [dir]      download Ruffle into <dir>/.swfbox/ruffle (then exit)

Options
  -o, --output <path>     output file (default: swfbox-library.html)
  -f, --format <fmt>      html | json | text          (default: html)
      --json              shorthand for --format json
      --ruffle <path|url> use a local Ruffle build or a custom URL
      --fetch-ruffle      download Ruffle into .swfbox/ruffle (one-time, explicit)
      --port <n>          server port, auto-increments  (default: 8080)
      --max-files <n>     scan cap                      (default: 5000)
      --follow            follow directory symlinks
      --open              open the browser (serve / play / report)
      --theme <name>      dark | light                  (default: dark)
  -q, --quiet             less output
      --no-color          disable ANSI colour
  -h, --help              show this help
  -v, --version           print the version

Examples
  npx swfbox ~/old-flash
  swfbox serve ~/old-flash --open
  swfbox play ~/old-flash/intro.swf
  swfbox inspect ~/old-flash/intro.swf --format json
  swfbox --fetch-ruffle ~/old-flash

Exit codes
  0  success
  1  no SWF files found, or invalid input
  2  operational error (write, server, download)

Offline
  swfbox never touches the network unless you pass --fetch-ruffle. A static
  report without a vendored Ruffle simply shows how to enable the player.
  'swfbox serve' uses ${DEFAULT_RUFFLE_URL} by default; vendor Ruffle for a
  fully offline shelf.
`;

function takeValue(argv, index, option) {
  const next = argv[index + 1];
  if (next === undefined) return { error: `${option} needs a value` };
  return { value: next, nextIndex: index + 1 };
}

/**
 * Parse argv into { command, options, positionals, errors }.
 */
export function parseArgs(argv) {
  const options = {
    output: null,
    format: "html",
    formatExplicit: false,
    ruffle: null,
    fetchRuffle: false,
    port: 8080,
    maxFiles: 5000,
    open: false,
    theme: "dark",
    quiet: false,
    color: true,
    follow: false,
    help: false,
    version: false,
  };
  const positionals = [];
  const errors = [];

  for (let i = 0; i < argv.length; i += 1) {
    let arg = argv[i];

    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }

    if (arg.startsWith("--") && arg.includes("=")) {
      const cut = arg.indexOf("=");
      const name = arg.slice(0, cut);
      const value = arg.slice(cut + 1);
      argv = [...argv.slice(0, i), name, value, ...argv.slice(i + 1)];
      arg = name;
    }

    if (!arg.startsWith("-") || arg === "-") {
      positionals.push(arg);
      continue;
    }

    const long = arg.startsWith("--") ? arg.slice(2) : null;
    const short = long ? null : arg.slice(1);

    if (long === "help" || short === "h") {
      options.help = true;
    } else if (long === "version" || short === "v") {
      options.version = true;
    } else if (long === "quiet" || short === "q") {
      options.quiet = true;
    } else if (long === "no-color") {
      options.color = false;
    } else if (long === "open") {
      options.open = true;
    } else if (long === "follow") {
      options.follow = true;
    } else if (long === "fetch-ruffle") {
      options.fetchRuffle = true;
    } else if (long === "json") {
      options.format = "json";
      options.formatExplicit = true;
    } else if (long === "output" || short === "o") {
      const result = takeValue(argv, i, "--output");
      if (result.error) errors.push(result.error);
      else {
        options.output = result.value;
        i = result.nextIndex;
      }
    } else if (long === "format" || short === "f") {
      const result = takeValue(argv, i, "--format");
      if (result.error) errors.push(result.error);
      else {
        if (!FORMATS.has(result.value)) errors.push(`Unknown format: ${result.value} (use html, json or text)`);
        else {
          options.format = result.value;
          options.formatExplicit = true;
        }
        i = result.nextIndex;
      }
    } else if (long === "ruffle") {
      const result = takeValue(argv, i, "--ruffle");
      if (result.error) errors.push(result.error);
      else {
        options.ruffle = result.value;
        i = result.nextIndex;
      }
    } else if (long === "port") {
      const result = takeValue(argv, i, "--port");
      if (result.error) errors.push(result.error);
      else {
        const port = Number(result.value);
        if (!Number.isInteger(port) || port < 0 || port > 65535) errors.push(`Invalid port: ${result.value}`);
        else options.port = port;
        i = result.nextIndex;
      }
    } else if (long === "max-files") {
      const result = takeValue(argv, i, "--max-files");
      if (result.error) errors.push(result.error);
      else {
        const max = Number(result.value);
        if (!Number.isInteger(max) || max < 1) errors.push(`Invalid --max-files: ${result.value}`);
        else options.maxFiles = max;
        i = result.nextIndex;
      }
    } else if (long === "theme") {
      const result = takeValue(argv, i, "--theme");
      if (result.error) errors.push(result.error);
      else {
        if (result.value !== "dark" && result.value !== "light") errors.push(`Unknown theme: ${result.value} (use dark or light)`);
        else options.theme = result.value;
        i = result.nextIndex;
      }
    } else {
      errors.push(`Unknown option: ${arg}`);
    }
  }

  let command = null;
  if (positionals.length > 0 && COMMANDS.has(positionals[0])) {
    command = positionals.shift();
  }

  return { command, options, positionals, errors };
}

function colourFor(options, stream = process.stdout) {
  if (!options.color) return false;
  if (process.env.NO_COLOR) return false;
  return Boolean(stream.isTTY);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
}

async function validateDirectory(directory) {
  const absolute = path.resolve(directory);
  try {
    const info = await stat(absolute);
    if (!info.isDirectory()) return { error: `Not a folder: ${absolute}` };
    return { root: absolute };
  } catch (error) {
    if (error?.code === "ENOENT") return { error: `Folder not found: ${absolute}` };
    if (error?.code === "EACCES" || error?.code === "EPERM") return { error: `Permission denied: ${absolute}` };
    return { error: `Cannot access folder: ${absolute}` };
  }
}

async function validateFile(file) {
  const absolute = path.resolve(file);
  try {
    const info = await stat(absolute);
    if (!info.isFile()) return { error: `Not a file: ${absolute}` };
    return { file: absolute, size: info.size, modified: info.mtime.toISOString() };
  } catch (error) {
    if (error?.code === "ENOENT") return { error: `File not found: ${absolute}` };
    if (error?.code === "EACCES" || error?.code === "EPERM") return { error: `Permission denied: ${absolute}` };
    return { error: `Cannot access file: ${absolute}` };
  }
}

function displayPath(target) {
  const relative = path.relative(process.cwd(), target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return target;
  return toPosix(relative);
}

function progressPrinter(enabled) {
  if (!enabled) return { update() {}, done() {} };
  let last = 0;
  let wrote = false;
  return {
    update(found) {
      const now = Date.now();
      if (now - last < 120) return;
      last = now;
      const line = `\r  Scanning… ${found} ${found === 1 ? "file" : "files"}`;
      process.stderr.write(line.padEnd(48));
      wrote = true;
    },
    done() {
      if (wrote) process.stderr.write(`${"\r"}${" ".repeat(48)}\r`);
    },
  };
}

async function resolveReportRuffle(options, root, outputDir) {
  try {
    const ruffle = await resolveRuffle({
      explicit: options.ruffle,
      root,
      mode: "static",
      outputDir,
      allowCdn: false,
    });
    return { ruffle };
  } catch (error) {
    return { error: error.message };
  }
}

async function runReport(options, positionals) {
  if (positionals.length > 1) {
    fail(`Unexpected argument: ${positionals[1]}`);
    return 1;
  }
  const directory = positionals[0] || ".";
  const validated = await validateDirectory(directory);
  if (validated.error) {
    fail(validated.error);
    return 1;
  }
  const root = validated.root;
  const colors = makeColour(colourFor(options));
  const progress = progressPrinter(!options.quiet && Boolean(process.stderr.isTTY));

  if (!options.quiet) {
    process.stderr.write(`${renderScanStart(root, { color: colors.enabled })}\n`);
  }

  let scan;
  try {
    scan = await scanFolder(root, {
      maxFiles: options.maxFiles,
      follow: options.follow,
      onProgress: ({ found }) => progress.update(found),
    });
  } catch (error) {
    progress.done();
    fail(error.message);
    return 2;
  }
  progress.done();

  if (scan.files.length === 0) {
    fail(`No SWF files found in ${root}`);
    if (options.format === "html") {
      // Still write an empty page: it explains what happened.
    } else if (options.format !== "json") {
      return 1;
    }
  }

  const outputPath = options.format === "html" ? path.resolve(options.output || "swfbox-library.html") : options.output ? path.resolve(options.output) : null;
  const outputDir = outputPath ? path.dirname(outputPath) : process.cwd();

  const resolved = await resolveReportRuffle(options, root, outputDir);
  if (resolved.error) {
    fail(resolved.error);
    return 1;
  }

  const library = buildLibrary(scan, {
    mode: "static",
    outputDir,
    ruffle: resolved.ruffle,
    theme: options.theme,
    version: VERSION,
  });

  if (options.format === "json") {
    const json = `${stableStringify(library)}\n`;
    if (outputPath) {
      try {
        await writeFile(outputPath, json, "utf8");
      } catch (error) {
        fail(`Could not write ${outputPath}: ${error.code || error.message}`);
        return 2;
      }
      if (!options.quiet) fail(`Wrote ${displayPath(outputPath)}`);
    } else {
      process.stdout.write(json);
    }
    return scan.files.length === 0 ? 1 : 0;
  }

  if (options.format === "text") {
    const text = renderTextList({ ...library, root: displayPath(root) }, {
      color: outputPath ? false : colourFor(options),
    });
    if (outputPath) {
      try {
        await writeFile(outputPath, `${text}\n`, "utf8");
      } catch (error) {
        fail(`Could not write ${outputPath}: ${error.code || error.message}`);
        return 2;
      }
      if (!options.quiet) fail(`Wrote ${displayPath(outputPath)}`);
    } else {
      process.stdout.write(`${text}\n`);
    }
    return scan.files.length === 0 ? 1 : 0;
  }

  const html = renderHtml(library);
  try {
    await writeFile(outputPath, html, "utf8");
  } catch (error) {
    fail(`Could not write ${outputPath}: ${error.code || error.message}`);
    return 2;
  }

  if (!options.quiet) {
    const ruffleText = resolved.ruffle
      ? `${ruffleLabel(resolved.ruffle)}${resolved.ruffle.absolute ? ` (${resolved.ruffle.absolute})` : ""}`
      : "not configured — run swfbox --fetch-ruffle for playback";
    process.stdout.write(
      renderReportSummary(library, {
        color: coloursEnabled(options),
        outputPath: displayPath(outputPath),
        ruffleText,
        hint: resolved.ruffle ? null : "The library page works without Ruffle; play buttons show setup instructions.",
      }),
    );
  } else {
    process.stdout.write(`${displayPath(outputPath)}\n`);
  }

  if (options.open) openTarget(pathToFileURL(outputPath).href);

  return scan.files.length === 0 ? 1 : 0;
}

function coloursEnabled(options) {
  return colourFor(options);
}

async function runInspect(options, positionals) {
  if (positionals.length === 0) {
    fail("inspect needs a file: swfbox inspect <file.swf>");
    return 1;
  }
  if (positionals.length > 1) {
    fail(`Unexpected argument: ${positionals[1]}`);
    return 1;
  }
  if (options.format === "html") {
    fail("inspect supports --format text or --format json");
    return 1;
  }
  const validated = await validateFile(positionals[0]);
  if (validated.error) {
    fail(validated.error);
    return 1;
  }

  const record = await parseSwfFile(validated.file, { maxReadBytes: 32 * 1024 * 1024 });
  record.modified = validated.modified;
  record.path = positionals[0];

  if (options.format === "json") {
    const json = `${stableStringify(record)}\n`;
    if (options.output) {
      const target = path.resolve(options.output);
      try {
        await writeFile(target, json, "utf8");
      } catch (error) {
        fail(`Could not write ${target}: ${error.code || error.message}`);
        return 2;
      }
    } else {
      process.stdout.write(json);
    }
    return record.error ? 1 : 0;
  }

  const text = `${renderInspect(record, { color: colourFor(options) })}\n`;
  if (options.output) {
    const target = path.resolve(options.output);
    try {
      await writeFile(target, text, "utf8");
    } catch (error) {
      fail(`Could not write ${target}: ${error.code || error.message}`);
      return 2;
    }
  } else {
    process.stdout.write(text);
  }
  return record.error ? 1 : 0;
}

async function runFetch(options, root) {
  const colours = makeColour(colourFor(options, process.stderr));
  if (!options.quiet) {
    process.stderr.write(
      `${colours.violet("Ruffle")} v${RUFFLE_VERSION} → ${path.join(root, ".swfbox", "ruffle")}\n`,
    );
  }
  let printed = false;
  let lastPercent = -1;
  try {
    const result = await fetchRuffle({
      root,
      onStatus: (message) => {
        if (!options.quiet) process.stderr.write(`  ${message}\n`);
      },
      onProgress: ({ received, total }) => {
        if (options.quiet) return;
        const percent = total > 0 ? Math.min(100, Math.floor((received / total) * 100)) : null;
        if (percent !== null && percent === lastPercent) return;
        lastPercent = percent ?? -1;
        printed = true;
        const suffix = percent === null ? "" : ` ${String(percent).padStart(3)}%`;
        process.stderr.write(`\r  ${formatBytes(received)}${suffix}   `);
      },
    });
    if (printed) process.stderr.write("\n");
    if (!options.quiet) {
      process.stderr.write(
        `  ${colours.green("✓")} Ruffle ${result.version} ready (${result.files} files) ${colours.dim(`· ${result.license}`)}\n`,
      );
      process.stderr.write(`  ${result.dir}\n`);
      process.stderr.write(`  ${colours.dim("Only this explicit command used the network.")}\n`);
    } else {
      process.stdout.write(`${result.dir}\n`);
    }
    return 0;
  } catch (error) {
    if (printed) process.stderr.write("\n");
    fail(error.message);
    return 2;
  }
}

async function attachSignals(handle) {
  let closing = false;
  const shutdown = () => {
    if (closing) process.exit(1);
    closing = true;
    process.stderr.write("\n  Stopping swfbox…\n");
    handle.close().then(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await new Promise((resolve) => handle.server.once("close", resolve));
  process.removeListener("SIGINT", shutdown);
  process.removeListener("SIGTERM", shutdown);
}

async function prepareServeRoot(options, positionals, { singleFile = false } = {}) {
  if (singleFile) {
    if (positionals.length > 1) return { error: `Unexpected argument: ${positionals[1]}` };
    const validated = await validateFile(positionals[0] || "");
    if (validated.error) return { error: validated.error };
    return { root: path.dirname(validated.file), file: validated.file };
  }
  if (positionals.length > 1) return { error: `Unexpected argument: ${positionals[1]}` };
  const validated = await validateDirectory(positionals[0] || ".");
  if (validated.error) return { error: validated.error };
  return { root: validated.root };
}

async function resolveServeRuffle(options, root) {
  try {
    const ruffle = await resolveRuffle({
      explicit: options.ruffle,
      root,
      mode: "serve",
      allowCdn: true,
    });
    return { ruffle };
  } catch (error) {
    return { error: error.message };
  }
}

function ruffleLine(ruffle) {
  if (!ruffle) return "not configured";
  if (ruffle.kind === "cdn") return `unpkg CDN v${RUFFLE_VERSION} (default) · run swfbox --fetch-ruffle for offline`;
  if (ruffle.kind === "local") return `local build · ${ruffle.absolute || ruffle.dir}`;
  return `custom URL · ${ruffle.url}`;
}

async function runServe(options, positionals) {
  const prepared = await prepareServeRoot(options, positionals);
  if (prepared.error) {
    fail(prepared.error);
    return 1;
  }
  const root = prepared.root;

  let scan;
  try {
    scan = await scanFolder(root, { maxFiles: options.maxFiles, follow: options.follow });
  } catch (error) {
    fail(error.message);
    return 2;
  }
  if (scan.files.length === 0) {
    fail(`No SWF files found in ${root}`);
    return 1;
  }

  const resolved = await resolveServeRuffle(options, root);
  if (resolved.error) {
    fail(resolved.error);
    return 1;
  }

  const library = buildLibrary(scan, {
    mode: "serve",
    ruffle: resolved.ruffle,
    theme: options.theme,
    version: VERSION,
  });

  let handle;
  try {
    handle = await startServer({ library, root, ruffle: resolved.ruffle, port: options.port });
  } catch (error) {
    fail(`Could not start server: ${error.message}`);
    return 2;
  }

  const colours = makeColour(colourFor(options));
  if (options.quiet) {
    process.stdout.write(`${handle.url}/\n`);
  } else {
    process.stdout.write(`\n  ${colours.bold("swfbox serve")}  ${colours.dim("·")}  ${root}\n`);
    process.stdout.write(`  ${colours.cyan(handle.url + "/")}\n\n`);
    process.stdout.write(`  ${scan.files.length} files · ${library.counts.readable} readable · ${library.counts.broken} broken\n`);
    process.stdout.write(`  Ruffle   ${ruffleLine(resolved.ruffle)}\n`);
    process.stdout.write(`  Health   ${handle.url}/health\n`);
    if (options.port !== 0 && handle.port !== options.port) {
      process.stdout.write(`  ${colours.yellow("!")} Port ${options.port} was busy; using ${handle.port}.\n`);
    }
    process.stdout.write(`  ${colours.dim("Press Ctrl+C to stop.")}\n`);
  }

  if (options.open) openTarget(`${handle.url}/`);
  await attachSignals(handle);
  return 0;
}

async function runPlay(options, positionals) {
  if (positionals.length === 0) {
    fail("play needs a file: swfbox play <file.swf>");
    return 1;
  }
  const prepared = await prepareServeRoot(options, positionals, { singleFile: true });
  if (prepared.error) {
    fail(prepared.error);
    return 1;
  }
  const root = prepared.root;
  const relativePath = path.relative(root, prepared.file);

  let scan;
  try {
    scan = await scanFolder(root, { maxFiles: options.maxFiles, follow: options.follow });
  } catch (error) {
    fail(error.message);
    return 2;
  }
  const entry = scan.files.find((item) => path.resolve(item.path) === path.resolve(prepared.file));
  if (!entry) {
    fail(`No SWF files found in ${root}`);
    return 1;
  }
  if (entry.error) {
    fail(`Could not read ${path.basename(prepared.file)}: ${entry.error}`);
    return 1;
  }

  const resolved = await resolveServeRuffle(options, root);
  if (resolved.error) {
    fail(resolved.error);
    return 1;
  }

  const library = buildLibrary(scan, {
    mode: "serve",
    ruffle: resolved.ruffle,
    theme: options.theme,
    version: VERSION,
  });

  let handle;
  try {
    handle = await startServer({ library, root, ruffle: resolved.ruffle, port: options.port });
  } catch (error) {
    fail(`Could not start server: ${error.message}`);
    return 2;
  }

  const playerUrl = `${handle.url}/player?f=${encodeURIComponent(relativePath)}`;
  const colours = makeColour(colourFor(options));
  if (options.quiet) {
    process.stdout.write(`${playerUrl}\n`);
  } else {
    process.stdout.write(`\n  ${colours.bold("swfbox play")}  ${path.basename(prepared.file)}\n`);
    process.stdout.write(`  ${playerUrl}\n`);
    process.stdout.write(`  Ruffle   ${ruffleLine(resolved.ruffle)}\n`);
    process.stdout.write(`  ${colours.dim("Press Ctrl+C to stop.")}\n`);
  }

  const opened = await openTarget(playerUrl);
  if (!opened) process.stdout.write(`  Could not open a browser automatically — visit the URL above.\n`);

  await attachSignals(handle);
  return 0;
}

export function openTarget(target) {
  try {
    let command;
    let args;
    let options = { detached: true, stdio: "ignore" };
    if (process.platform === "win32") {
      command = "cmd";
      args = ["/c", "start", "", target];
      options = { ...options, windowsVerbatimArguments: false };
    } else if (process.platform === "darwin") {
      command = "open";
      args = [target];
    } else {
      command = "xdg-open";
      args = [target];
    }
    const child = spawn(command, args, options);
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  const { command, options, positionals } = parsed;

  if (parsed.errors.length > 0) {
    for (const error of parsed.errors) fail(error);
    fail("Run swfbox --help for usage.");
    return 1;
  }

  if (options.help || command === "help") {
    process.stdout.write(HELP);
    return 0;
  }

  if (options.version || command === "version") {
    process.stdout.write(`swfbox ${VERSION}\n`);
    return 0;
  }

  if (options.fetchRuffle) {
    if (!command && positionals.length > 1) {
      fail(`Unexpected argument: ${positionals[1]}`);
      return 1;
    }
    let root;
    if (command === "play" || command === "inspect") {
      if (positionals[0]) root = path.dirname(path.resolve(positionals[0]));
      else root = process.cwd();
    } else {
      root = path.resolve(positionals[0] || ".");
    }
    if (!options.quiet && root !== process.cwd()) {
      // The message below includes the destination.
    }
    const code = await runFetch(options, root);
    if (code !== 0) return code;
    // --fetch-ruffle is a setup command: without another command it fetches and
    // exits. Use `swfbox serve --fetch-ruffle` to fetch and then serve.
    if (!command) return 0;
  }

  try {
    if (command === "inspect") {
      if (!options.formatExplicit) options.format = "text";
      return await runInspect(options, positionals);
    }
    if (command === "serve") return await runServe(options, positionals);
    if (command === "play") return await runPlay(options, positionals);
    return await runReport(options, positionals);
  } catch (error) {
    fail(`Unexpected error: ${error?.message || "unknown"}`);
    return 2;
  }
}

export default main;
