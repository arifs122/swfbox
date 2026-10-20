import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";

import { buildLibrary } from "../src/library.js";
import { renderHtml } from "../src/render-html.js";
import { renderPlayerPage } from "../src/player.js";
import { scanFolder } from "../src/scan.js";
import { DEFAULT_RUFFLE_URL } from "../src/util.js";
import { buildSwf, doAction, metadataTag } from "../test-support/swf-builder.js";

async function put(root, relative, contents) {
  const target = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
  return target;
}

async function makeLibrary(files, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "swfbox-html-"));
  for (const [relative, contents] of Object.entries(files)) {
    await put(root, relative, contents);
  }
  const scan = await scanFolder(root, { maxFiles: options.maxFiles });
  return buildLibrary(scan, {
    generatedAt: "2026-01-02T03:04:05.000Z",
    outputDir: root,
    theme: options.theme || "dark",
    ruffle: options.ruffle || null,
    mode: options.mode || "static",
  });
}

test("static library is self-contained and has the expected controls", async () => {
  const library = await makeLibrary({
    "intro.swf": buildSwf({ width: 640, height: 480, fps: 24, frames: 5, tags: [metadataTag({ title: "Intro Movie" })] }),
    "game/AS3 Title.swf": buildSwf({ width: 800, height: 600, tags: [metadataTag({ title: "Space Cadet" })] }),
    "broken.swf": Buffer.from("not a swf at all"),
  });
  const html = renderHtml(library);

  // The report is meant to be published: it must not carry the author's local path.
  assert.equal(html.includes(library.root), false, "the absolute scan root must not be embedded");
  assert.equal(/[A-Za-z]:\\/.test(html), false, "no Windows drive paths in the report");

  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /Every SWF/);
  assert.match(html, /id="search"/);
  assert.match(html, /data-filter="all"/);
  assert.match(html, /data-filter="as3"/);
  assert.match(html, /data-filter="as2"/);
  assert.match(html, /data-filter="unknown"/);
  assert.match(html, /data-filter="broken"/);
  assert.match(html, /id="sort"/);
  assert.match(html, /id="grid"/);
  assert.match(html, /<dialog class="detail"/);
  assert.match(html, /id="library-data" type="application\/json"/);
  assert.match(html, /Could not read/);
  assert.match(html, /No Ruffle configured/);
  assert.match(html, /swfbox --fetch-ruffle/);
  assert.match(html, /"width":640/);
  assert.match(html, /"height":480/);
  assert.match(html, /"frameRate":24/);
  assert.match(html, /"frameCount":5/);
  assert.equal(/https?:\/\//i.test(html), false, "no external references without a configured Ruffle");
  assert.equal(html.includes("<link"), false, "no external stylesheets");
});

test("filesystem strings are escaped, including script-breaking metadata", async () => {
  const nastyTitle = "</script><script>window.PWNED=1</script>";
  const library = await makeLibrary({
    'A&B (quoted) film.swf': buildSwf({
      width: 320,
      height: 240,
      tags: [metadataTag({ title: nastyTitle, creator: '"><img src=x onerror=alert(1)>' })],
    }),
  });
  const html = renderHtml(library);

  assert.equal(html.includes("</script><script>window.PWNED"), false);
  assert.equal(html.includes('<img src=x onerror='), false);
  assert.ok(html.includes("\\u003c/script\\u003e"), "script-breaking text is unicode-escaped in JSON");
  assert.ok(html.includes("A\\u0026B"), "ampersands in the JSON payload are escaped");
});

test("a configured Ruffle URL appears once and is shown as a badge", async () => {
  const library = await makeLibrary(
    { "movie.swf": buildSwf({ width: 320, height: 240 }) },
    { ruffle: { kind: "cdn", url: DEFAULT_RUFFLE_URL } },
  );
  const html = renderHtml(library);
  assert.ok(html.includes(DEFAULT_RUFFLE_URL));
  assert.equal(html.split(DEFAULT_RUFFLE_URL).length - 1, 2);
  assert.match(html, /Ruffle · unpkg CDN/);
  assert.match(html, /Loading Ruffle/);
  assert.match(html, /ruffle-player/);
  assert.match(html, /RufflePlayer\.newest/);
  assert.match(html, /createPlayer\(\)/);
});

test("serve mode generates SWF and player URLs per entry", async () => {
  const library = await makeLibrary(
    { "shows/Episode 1.swf": buildSwf({ width: 640, height: 480 }) },
    { mode: "serve", ruffle: { kind: "local", url: "/ruffle/ruffle.js" } },
  );
  const html = renderHtml(library);
  assert.ok(html.includes('"src":"/swf/shows/Episode%201.swf"'));
  assert.ok(html.includes('"playerUrl":"/player?f=shows%2FEpisode%201.swf"'));
  assert.match(html, /Ruffle · local build/);
});

test("theme, generated timestamp and empty libraries render deterministically", async () => {
  const files = { "one.swf": buildSwf({ width: 100, height: 100 }) };
  const first = await makeLibrary(files, { theme: "light" });
  const second = await makeLibrary(files, { theme: "light" });
  const firstHtml = renderHtml(first);
  const secondHtml = renderHtml(second);
  assert.match(firstHtml, /data-theme="light"/);
  const normalise = (html) =>
    html
      .replace(/swfbox-html-[A-Za-z0-9]+/g, "ROOT")
      .replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "DATE");
  assert.equal(normalise(firstHtml), normalise(secondHtml));

  const empty = await makeLibrary({});
  const emptyHtml = renderHtml(empty);
  assert.match(emptyHtml, /No SWF files were found here yet/);
  assert.match(emptyHtml, /"total":0/);
  assert.match(emptyHtml, /No .swf files were found/);
});

test("player page embeds Ruffle, metadata and keyboard navigation", async () => {
  const library = await makeLibrary(
    {
      "a.swf": buildSwf({ width: 550, height: 400, fps: 24, frames: 9, tags: [metadataTag({ title: "First" })] }),
      "b.swf": buildSwf({ width: 640, height: 480, tags: [metadataTag({ title: "Second" })] }),
      "c.swf": buildSwf({ width: 800, height: 600, tags: [metadataTag({ title: "Third" })] }),
    },
    { mode: "serve", ruffle: { kind: "cdn", url: DEFAULT_RUFFLE_URL } },
  );
  const middle = library.entries.find((entry) => entry.title === "Second");
  const html = renderPlayerPage(library, middle);

  assert.match(html, /class="player-page"/);
  assert.match(html, /data-src="\/swf\/b\.swf"/);
  assert.ok(html.includes(`data-ruffle="${DEFAULT_RUFFLE_URL}"`));
  assert.match(html, /Loading Ruffle/);
  assert.match(html, /ruffle-player/);
  assert.match(html, /Ruffle could not load/);
  assert.match(html, /player\.ruffle\(\)\.load/);
  assert.match(html, /id="nav-prev"/);
  assert.match(html, /id="nav-next"/);
  assert.match(html, /href="\/player\?f=a\.swf" id="nav-prev"/);
  assert.match(html, /href="\/player\?f=c\.swf" id="nav-next"/);
  assert.match(html, /2 \/ 3/);
  assert.match(html, /ArrowLeft|←/);
  assert.match(html, /550|640/);
  assert.match(html, /Second/);
});

test("player page handles a missing Ruffle and broken files without pretending", async () => {
  const library = await makeLibrary(
    {
      "ok.swf": buildSwf({ width: 320, height: 240 }),
      "bad.swf": Buffer.from("not an swf"),
    },
    { mode: "serve" },
  );
  const good = library.entries.find((entry) => entry.title === "ok");
  const goodHtml = renderPlayerPage(library, good);
  assert.match(goodHtml, /No Ruffle configured/);
  assert.match(goodHtml, /swfbox --fetch-ruffle/);
  assert.equal(goodHtml.includes("<ruffle-player"), false);

  const bad = library.entries.find((entry) => entry.broken);
  const badHtml = renderPlayerPage(library, bad);
  assert.match(badHtml, /could not be read/i);
  assert.match(badHtml, /Not an SWF file/);
  assert.equal(badHtml.includes("<ruffle-player"), false);
});

test("player page escapes hostile titles and paths", async () => {
  const library = await makeLibrary({
    "evil.swf": buildSwf({ tags: [metadataTag({ title: "</h1><script>alert(1)</script>" })] }),
  });
  const entry = library.entries[0];
  const html = renderPlayerPage(library, entry);
  assert.equal(html.includes("<script>alert(1)</script>"), false);
  assert.ok(html.includes("&lt;/h1&gt;"));
});

test("library counts classify AS3, AS2, unknown and broken", async () => {
  const library = await makeLibrary({
    "as3.swf": buildSwf({ tags: [as3Attributes()] }),
    "as2.swf": buildSwf({ tags: [doAction()] }),
    "unknown.swf": buildSwf({ tags: [metadataTag({})] }),
    "broken.swf": Buffer.alloc(0),
  });
  assert.equal(library.counts.total, 4);
  assert.equal(library.counts.broken, 1);
  assert.equal(library.counts.as3, 1);
  assert.equal(library.counts.as2, 1);
  assert.equal(library.counts.unknown, 1);
  assert.equal(library.entries.find((entry) => entry.name === "as3.swf").kind, "as3");
  assert.equal(library.entries.find((entry) => entry.name === "as2.swf").kind, "as2");
});

function as3Attributes() {
  // A FileAttributes tag with the AS3 bit (0x08) and nothing else.
  const payload = Buffer.from([0x08, 0x00, 0x00, 0x00]);
  const header = Buffer.alloc(2);
  header.writeUInt16LE((69 << 6) | payload.length, 0);
  return Buffer.concat([header, payload]);
}
