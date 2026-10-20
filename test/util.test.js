import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_RUFFLE_URL,
  RUFFLE_VERSION,
  decodeXmlEntities,
  encodePathSegments,
  escapeHtml,
  formatBytes,
  formatDate,
  makeColour,
  padEndVisible,
  plural,
  round2,
  safeText,
  stableStringify,
  toPosix,
  truncate,
  visibleLength,
  xmlText,
} from "../src/util.js";

test("escapeHtml covers text and attribute contexts", () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  assert.equal(escapeHtml("a & b"), "a &amp; b");
  assert.equal(escapeHtml("it's `quoted`"), "it&#39;s &#96;quoted&#96;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml(42), "42");
});

test("XML entities decode safely", () => {
  assert.equal(decodeXmlEntities("Tom &amp; Jerry"), "Tom & Jerry");
  assert.equal(decodeXmlEntities("&lt;tag&gt;"), "<tag>");
  assert.equal(decodeXmlEntities("&#65;&#x42;&#x1F600;"), "AB\u{1F600}");
  assert.equal(decodeXmlEntities("&unknown; stays"), "&unknown; stays");
  assert.equal(xmlText("<p>Hello <b>world</b></p>"), "Hello world");
  assert.equal(xmlText("  spaced \n text  "), "spaced text");
});

test("byte and date formatting is predictable", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(999), "999 B");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(1024 * 1024), "1.0 MB");
  assert.equal(formatBytes(10.5 * 1024 * 1024), "10.5 MB");
  assert.equal(formatBytes(200 * 1024 * 1024), "200 MB");
  assert.equal(formatDate("2026-03-04T12:00:00Z"), "2026-03-04");
  assert.equal(formatDate("not a date"), "unknown date");
  assert.equal(round2(123.456), 123.46);
  assert.equal(round2(24), 24);
  assert.equal(round2(Number.NaN), null);
});

test("paths and URLs are normalised without hard-coded separators", () => {
  assert.equal(toPosix("a\\b\\c.swf"), "a/b/c.swf");
  assert.equal(encodePathSegments("shows/Episode 1 & 2.swf"), "shows/Episode%201%20%26%202.swf");
  assert.equal(encodePathSegments("üñïcode/#1.swf"), "%C3%BC%C3%B1%C3%AFcode/%231.swf");
  assert.equal(encodePathSegments("\\nested\\movie.swf"), "nested/movie.swf");
});

test("stableStringify sorts keys, keeps arrays and drops undefined", () => {
  const value = {
    zebra: 1,
    alpha: { z: 2, a: 3, dropped: undefined },
    list: [{ b: 2, a: 1 }, "x"],
    tail: null,
  };
  const json = stableStringify(value);
  assert.equal(
    json,
    `{
  "alpha": {
    "a": 3,
    "z": 2
  },
  "list": [
    {
      "a": 1,
      "b": 2
    },
    "x"
  ],
  "tail": null,
  "zebra": 1
}`,
  );
  assert.equal(json.includes("dropped"), false);
  assert.deepEqual(Object.keys(JSON.parse(stableStringify({ b: 1, a: 2 }))), ["a", "b"]);
});

test("colour helpers respect --no-color and alignment ignores escapes", () => {
  const plain = makeColour(false);
  assert.equal(plain.bold("hello"), "hello");
  assert.equal(plain.violet("x"), "x");

  const colour = makeColour(true);
  assert.match(colour.bold("hello"), /\u001b\[1mhello\u001b\[0m/);
  assert.equal(visibleLength(colour.bold("hello")), 5);
  assert.equal(padEndVisible(colour.bold("hi"), 5), `${colour.bold("hi")}   `);
  assert.equal(truncate("abcdefghij", 5), "abcd…");
  assert.equal(truncate("abc", 5), "abc");
  assert.equal(plural(1, "file"), "1 file");
  assert.equal(plural(3, "file"), "3 files");
  assert.equal(plural(3, "match", "matches"), "3 matches");
});

test("safeText strips terminal control characters", () => {
  assert.equal(safeText("hello\u0000\u001b[31mworld"), "hello[31mworld");
  assert.equal(safeText("tab\tkept"), "tab\tkept");
  assert.equal(safeText("line\nkept"), "line\nkept");
});

test("Ruffle constants are pinned and documented", () => {
  assert.match(DEFAULT_RUFFLE_URL, /^https:\/\/unpkg\.com\/@ruffle-rs\/ruffle@\d+\.\d+\.\d+\/ruffle\.js$/);
  assert.match(RUFFLE_VERSION, /^\d+\.\d+\.\d+$/);
  assert.ok(DEFAULT_RUFFLE_URL.includes(RUFFLE_VERSION));
});
