/**
 * Small shared helpers: byte/date formatting, HTML escaping, stable JSON and
 * ANSI colours. Deliberately dependency-free.
 */

export const VERSION = "0.1.0";
export const DEFAULT_RUFFLE_URL = "https://unpkg.com/@ruffle-rs/ruffle@0.7.1/ruffle.js";
export const RUFFLE_VERSION = "0.7.1";
export const RUFFLE_LICENSE = "MIT OR Apache-2.0";
export const RUFFLE_NPM_TARBALL = `https://registry.npmjs.org/@ruffle-rs/ruffle/-/ruffle-${RUFFLE_VERSION}.tgz`;

/** Round to two decimals without trailing zero noise in JSON. */
export function round2(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "?";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  if (value < 10) return `${value.toFixed(1)} ${units[i]}`;
  if (value < 100) return `${Number.isInteger(value) ? String(value) : value.toFixed(1)} ${units[i]}`;
  return `${Math.round(value)} ${units[i]}`;
}

export function formatDate(input) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "unknown date";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDateTime(input) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${formatDate(date)} ${String(date.getUTCHours()).padStart(2, "0")}:${String(
    date.getUTCMinutes(),
  ).padStart(2, "0")} UTC`;
}

const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

/** Escape a string for use in HTML text or a quoted attribute. */
export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'`]/g, (char) => HTML_ENTITIES[char]);
}

/** Alias used by templates where an attribute is being escaped. */
export const escapeAttr = escapeHtml;

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decode the XML entities commonly found in XMP metadata. */
export function decodeXmlEntities(value) {
  if (typeof value !== "string") return "";
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

/** Strip tags, decode entities and collapse whitespace. */
export function xmlText(value) {
  if (typeof value !== "string") return "";
  return decodeXmlEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Replace control characters so terminal output cannot be hijacked. */
export function safeText(value) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

export function truncate(value, max = 80) {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** Forward slashes, always. */
export function toPosix(value) {
  return String(value).replace(/\\/g, "/");
}

/** Encode each path segment for use in a URL (keeps slashes). */
export function encodePathSegments(relativePath) {
  return toPosix(relativePath)
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/** True when the value looks like an http(s) URL. */
export function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

/** Stable key order for deterministic JSON output. */
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = sortValue(value[key]);
    }
    return out;
  }
  return value;
}

export function stableStringify(value, space = 2) {
  return JSON.stringify(sortValue(value), null, space);
}

const COLOURS = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  violet: "\u001b[38;5;141m",
  cyan: "\u001b[38;5;80m",
  green: "\u001b[38;5;78m",
  yellow: "\u001b[38;5;221m",
  red: "\u001b[38;5;203m",
  grey: "\u001b[38;5;245m",
};

export function makeColour(enabled) {
  if (!enabled) {
    const plain = (value) => String(value ?? "");
    return {
      enabled: false,
      reset: plain,
      bold: plain,
      dim: plain,
      violet: plain,
      cyan: plain,
      green: plain,
      yellow: plain,
      red: plain,
      grey: plain,
    };
  }
  const out = { enabled: true };
  for (const [name, code] of Object.entries(COLOURS)) {
    out[name] = (value) => `${code}${value}${COLOURS.reset}`;
  }
  return out;
}

/** Lightweight alignment helper that ignores ANSI escape sequences. */
export function visibleLength(value) {
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/\u001b\[[0-9;]*m/g, "").length;
}

export function padEndVisible(value, width) {
  const text = String(value);
  return text + " ".repeat(Math.max(0, width - visibleLength(text)));
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
