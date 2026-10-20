/**
 * Terminal output: inspect a single SWF, summarise a generated report, or print
 * a plain-text index for piping.
 */

import {
  formatBytes,
  makeColour,
  padEndVisible,
  plural,
  safeText,
  toPosix,
  truncate,
} from "./util.js";

function line(label, value, width = 14) {
  return `  ${padEndVisible(label, width)}${value}`;
}

function signatureLabel(record) {
  if (!record.signature) return "unknown";
  if (record.signature === "FWS") return "FWS (uncompressed)";
  if (record.signature === "CWS") return "CWS (zlib)";
  if (record.signature === "ZWS") return "ZWS (LZMA)";
  return record.signature;
}

export function renderInspect(record, options = {}) {
  const c = makeColour(options.color !== false);
  const lines = [];
  const ok = !record.error;

  lines.push("");
  lines.push(`  ${c.bold("swfbox")} ${c.dim("inspect")}`);
  lines.push("");
  lines.push(`  ${c.violet(safeText(record.path || "(unknown)"))}`);
  lines.push("");

  if (!ok) {
    lines.push(`  ${c.red("! Could not read this SWF")}`);
    lines.push(`  ${safeText(record.error)}`);
    if (record.signature) lines.push(line("Signature", safeText(record.signature)));
    lines.push(line("Size", formatBytes(record.size)));
    lines.push("");
    return lines.join("\n");
  }

  if (record.width !== null && record.height !== null) {
    lines.push(line("Stage", `${record.width} × ${record.height} px`));
    if (record.twips) {
      lines.push(line("", c.dim(`${record.twips.width} × ${record.twips.height} twips`), 14));
    }
  } else {
    lines.push(line("Stage", c.yellow("unknown")));
  }
  lines.push(line("Frame rate", record.frameRate !== null ? `${record.frameRate} fps` : c.yellow("unknown")));
  lines.push(line("Frames", record.frameCount !== null ? String(record.frameCount) : c.yellow("unknown")));
  lines.push(line("Signature", signatureLabel(record)));
  lines.push(line("SWF version", record.version !== null ? `v${record.version}` : "unknown"));
  lines.push(line("Declared size", formatBytes(record.fileLength)));
  lines.push(line("On disk", formatBytes(record.size)));
  lines.push(
    line(
      "ActionScript",
      record.asVersion === 3 ? c.violet("AS3") : record.asVersion === 2 ? c.cyan("AS2") : c.dim("not declared"),
    ),
  );
  lines.push(line("Background", record.backgroundColor || c.dim("not set")));
  lines.push(line("Network", record.useNetwork ? c.yellow("declared (may load URLs)") : "not declared"));
  if (record.truncated) lines.push(line("Truncated", c.yellow("yes — last tags may be missing")));

  lines.push("");
  lines.push(`  ${c.bold("Tags")}`);
  lines.push(line("Parsed", String(record.tagCount), 16));
  lines.push(line("Sprites", String(record.spriteCount), 16));
  lines.push(line("Shapes", String(record.shapeCount), 16));
  lines.push(line("Sounds", String(record.soundCount), 16));
  lines.push(line("Video", String(record.videoCount), 16));

  if (record.hasMetadata) {
    lines.push("");
    lines.push(`  ${c.bold("Embedded metadata")}`);
    lines.push(line("Title", record.metadata.title ? safeText(record.metadata.title) : c.dim("none"), 16));
    lines.push(line("Creator", record.metadata.creator ? safeText(record.metadata.creator) : c.dim("none"), 16));
    lines.push(
      line(
        "Description",
        record.metadata.description ? safeText(record.metadata.description) : c.dim("none"),
        16,
      ),
    );
  } else {
    lines.push("");
    lines.push(`  ${c.dim("No XMP metadata tag in this file.")}`);
  }

  lines.push("");
  return lines.join("\n");
}

export function renderTextList(library, options = {}) {
  const c = makeColour(options.color !== false);
  const lines = [];
  lines.push(
    `  ${c.bold("swfbox")} ${c.dim(safeText(library.root))} — ${plural(library.counts.total, "file")} (${
      library.counts.broken
    } broken)`,
  );
  for (const entry of library.entries) {
    const version = entry.asVersion ? `AS${entry.asVersion}` : entry.broken ? "ERR" : "?";
    const stage = entry.width !== null ? `${entry.width}×${entry.height}` : "—";
    const fps = entry.frameRate !== null && entry.frameRate !== undefined ? `${entry.frameRate}fps` : "";
    const size = formatBytes(entry.size).padStart(8);
    const flags = entry.broken ? c.red("broken") : c.dim(version);
    lines.push(
      `  ${size}  ${stage.padEnd(13)}  ${fps.padStart(7)}  ${padEndVisible(flags, 8)}  ${safeText(
        toPosix(entry.relativePath),
      )}`,
    );
  }
  lines.push("");
  lines.push(
    c.dim(
      `${library.counts.readable} readable · ${library.counts.broken} unreadable · ${formatBytes(library.totalBytes)} total`,
    ),
  );
  return lines.join("\n");
}

export function renderReportSummary(library, options = {}) {
  const c = makeColour(options.color !== false);
  const lines = [];
  const counts = library.counts;

  lines.push("");
  lines.push(`  ${c.bold("swfbox")} ${c.dim("·")} ${c.violet(safeText(library.rootName))}`);
  lines.push(
    `  ${counts.total} files  ${c.dim("·")}  ${counts.readable} readable  ${c.dim("·")}  ${
      counts.broken > 0 ? c.red(`${counts.broken} broken`) : "0 broken"
    }  ${c.dim("·")}  ${formatBytes(library.totalBytes)}`,
  );
  lines.push(
    `  AS3 ${counts.as3}  ${c.dim("·")}  AS2 ${counts.as2}  ${c.dim("·")}  unknown ${counts.unknown}`,
  );
  if (options.outputPath) {
    lines.push("");
    lines.push(`  ${c.green("✓")} Wrote ${c.bold(safeText(options.outputPath))}`);
  }
  if (options.ruffleText) {
    lines.push(`  ${c.dim("Ruffle:")} ${options.ruffleText}`);
  }
  if (options.hint) {
    lines.push(`  ${c.dim(options.hint)}`);
  }

  const broken = library.entries.filter((entry) => entry.broken).slice(0, 4);
  if (broken.length > 0) {
    lines.push("");
    lines.push(`  ${c.yellow("Unreadable files")}`);
    for (const entry of broken) {
      lines.push(`  ${c.red("!")} ${safeText(entry.relativePath)} ${c.dim("—")} ${c.dim(truncate(entry.error, 96))}`);
    }
    if (counts.broken > broken.length) lines.push(c.dim(`    and ${counts.broken - broken.length} more`));
  }

  if (library.warnings && library.warnings.length > 0) {
    lines.push("");
    for (const warning of library.warnings.slice(0, 3)) lines.push(`  ${c.yellow("!")} ${safeText(warning)}`);
  }

  lines.push("");
  return lines.join("\n");
}

export function renderScanStart(root, options = {}) {
  const c = makeColour(options.color !== false);
  return `${c.dim("Scanning")} ${safeText(root)} ${c.dim("…")}`;
}
