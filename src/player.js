/**
 * The focused player page: a full-bleed Ruffle stage with a metadata sidebar,
 * previous/next navigation and keyboard shortcuts. Rendered by the local server
 * (`swfbox serve` / `swfbox play`), never by the static report.
 */

import { escapeAttr, escapeHtml, formatBytes, formatDate } from "./util.js";
import { pageShell, PLAYER_CSS } from "./render-html.js";

function ruffleLabel(ruffle) {
  if (!ruffle) return "Ruffle not configured";
  if (ruffle.kind === "local") return "Ruffle · local build";
  if (ruffle.kind === "cdn") return "Ruffle · unpkg CDN";
  return "Ruffle · custom URL";
}

function ruffleTone(ruffle) {
  return ruffle ? "ok" : "warn";
}

export function renderPlayerPage(library, entry) {
  const theme = library.theme || "dark";
  const ruffle = library.ruffle;
  const entries = library.entries;
  const index = entries.findIndex((item) => item.relativePath === entry.relativePath);
  const prev = index > 0 ? entries[index - 1] : null;
  const next = index >= 0 && index < entries.length - 1 ? entries[index + 1] : null;
  const broken = entry.broken;
  const label = ruffleLabel(ruffle);

  const navLink = (item, text, id) => {
    if (!item) return `<span class="disabled" id="${id}">${escapeHtml(text)}</span>`;
    return `<a href="/player?f=${escapeAttr(encodeURIComponent(item.relativePath))}" id="${id}">${escapeHtml(text)}</a>`;
  };

  let stageContent;
  if (broken) {
    stageContent = `<div class="watch-fallback">
      <h2>This file could not be read</h2>
      <p>${escapeHtml(entry.error || "The parser rejected this SWF.")}</p>
      <p class="muted">It stays in the library so the archive is honest about what it contains.</p>
      <a class="btn" href="/">Back to the library</a>
    </div>`;
  } else if (!ruffle) {
    stageContent = `<div class="watch-fallback">
      <h2>No Ruffle configured</h2>
      <p>No Ruffle configured — run <code>swfbox --fetch-ruffle</code> or <code>swfbox serve</code>.</p>
      <p class="muted">The library, parser and server are entirely offline; only the player needs Ruffle.</p>
      <span class="cmd">swfbox --fetch-ruffle</span>
    </div>`;
  } else {
    stageContent = `<div class="watch-loading" id="watch-loading"><div class="spinner"></div><div>Loading Ruffle…</div><div class="faint">The first load fetches the player.</div></div>`;
  }

  const meta = entry.metadata || { title: null, creator: null, description: null };
  const details = [
    ["Stage", entry.dimensions ? `${entry.dimensions} px` : "unknown"],
    ["Frame rate", entry.frameRate !== null && entry.frameRate !== undefined ? `${entry.frameRate} fps` : "unknown"],
    ["Frames", entry.frameCount !== null && entry.frameCount !== undefined ? String(entry.frameCount) : "unknown"],
    ["ActionScript", entry.asVersion ? `AS${entry.asVersion}` : "not declared"],
    ["SWF version", entry.version !== null && entry.version !== undefined ? `v${entry.version}` : "—"],
    ["Compression", entry.compression || "—"],
    ["Size", formatBytes(entry.size)],
    ["Modified", entry.modified ? formatDate(entry.modified) : "unknown"],
    ["Tags", entry.tagCount !== null && entry.tagCount !== undefined ? String(entry.tagCount) : "—"],
    ["Sprites", String(entry.spriteCount ?? "—")],
    ["Shapes", String(entry.shapeCount ?? "—")],
    ["Sounds", String(entry.soundCount ?? "—")],
    ["Video", String(entry.videoCount ?? "—")],
  ];

  const body = `
<header class="watch-top">
  <div class="watch-left">
    <a class="back-link" href="/">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg>
      Library
    </a>
    <div class="watch-title">
      <h1>${escapeHtml(entry.title)}</h1>
      <p>${escapeHtml(entry.relativePath)}</p>
    </div>
  </div>
  <div class="watch-right">
    <span class="pill-status"><span class="dot ${ruffleTone(ruffle)}"></span><strong>${escapeHtml(label)}</strong></span>
    <button class="icon-btn" id="fullscreen" type="button" aria-label="Toggle fullscreen" title="Fullscreen">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"></path></svg>
    </button>
  </div>
</header>
<div class="watch-body">
  <div class="watch-stage-wrap">
    <div class="watch-stage" id="watch-stage" data-src="${escapeAttr(entry.src)}" data-ruffle="${escapeAttr(ruffle ? ruffle.url : "")}">${stageContent}</div>
    <div class="watch-under">
      <span>${escapeHtml(entry.relativePath)}</span>
      <div class="watch-nav">
        ${navLink(prev, "← Previous", "nav-prev")}
        <span>${index >= 0 ? index + 1 : "?"} / ${entries.length}</span>
        ${navLink(next, "Next →", "nav-next")}
      </div>
    </div>
  </div>
  <aside class="watch-side">
    <h2>${escapeHtml(entry.title)}</h2>
    <p class="side-path">${escapeHtml(entry.relativePath)}</p>
    <div>${entry.kind === "as3" ? '<span class="badge as3">AS3</span>' : entry.kind === "as2" ? '<span class="badge as2">AS2</span>' : entry.broken ? '<span class="badge broken">Broken</span>' : '<span class="badge unknown">Unknown</span>'}</div>

    <h3>File details</h3>
    <dl class="kv">
      ${details.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}
    </dl>

    ${meta.creator ? `<h3>Creator</h3><div class="meta-block"><p>${escapeHtml(meta.creator)}</p></div>` : ""}
    ${meta.description ? `<h3>Description</h3><div class="meta-block"><p>${escapeHtml(meta.description)}</p></div>` : ""}

    <h3>Keyboard</h3>
    <ul class="shortcuts">
      <li><span>Previous / next</span><span><kbd>←</kbd> <kbd>→</kbd></span></li>
      <li><span>Back to library</span><kbd>Esc</kbd></li>
      <li><span>Fullscreen</span><kbd>F</kbd></li>
    </ul>

    ${!ruffle ? `<h3>Offline player</h3><p class="hint">Run <code>swfbox --fetch-ruffle</code> in this folder to vendor Ruffle, then restart the server.</p>` : ""}
    ${ruffle && ruffle.kind === "cdn" ? `<h3>Network</h3><p class="hint">This page loads Ruffle from unpkg. Run <code>swfbox --fetch-ruffle</code> for a fully offline player.</p>` : ""}
    <h3>Parser</h3>
    <p class="hint">Metadata read by swfbox itself. Ruffle handles rendering and ActionScript; swfbox never executes SWF code.</p>
  </aside>
</div>
`;

  return pageShell({
    title: `${entry.title} — swfbox`,
    description: `Play ${entry.title} from ${library.rootName} through Ruffle.`,
    theme,
    bodyClass: "player-page",
    css: PLAYER_CSS,
    body,
    dataScript: `<script>${PLAYER_JS}</script>`,
  });
}

const PLAYER_JS = String.raw`
const stage = document.getElementById("watch-stage");
const watchSrc = stage ? stage.dataset.src : "";
const watchRuffle = stage ? stage.dataset.ruffle : "";

function playerFallback(title, message, detail) {
  const box = document.createElement("div");
  box.className = "watch-fallback";
  const heading = document.createElement("h2");
  heading.textContent = title;
  box.appendChild(heading);
  const text = document.createElement("p");
  text.textContent = message;
  box.appendChild(text);
  if (detail) {
    const cmd = document.createElement("span");
    cmd.className = "cmd";
    cmd.textContent = detail;
    box.appendChild(cmd);
  }
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "btn";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => location.reload());
  box.appendChild(retry);
  return box;
}

function mountRuffle() {
  if (!stage || !watchSrc || !watchRuffle) return;
  let settled = false;
  let loadTimer = null;
  const showError = (title, message, detail) => {
    clearTimeout(loadTimer);
    stage.replaceChildren(playerFallback(title, message, detail));
  };
  const fail = (title, message, detail) => {
    if (settled) return;
    settled = true;
    showError(title, message, detail);
  };
  const play = () => {
    const source = window.RufflePlayer && typeof window.RufflePlayer.newest === "function"
      ? window.RufflePlayer.newest()
      : null;
    if (!source) {
      fail("Ruffle could not start", "Ruffle loaded but did not expose its player API.", watchRuffle);
      return;
    }
    const player = source.createPlayer();
    player.style.width = "100%";
    player.style.height = "100%";
    player.setAttribute("letterbox", "on");
    if ("config" in player) player.config = { ...(player.config || {}), autoplay: "on" };
    stage.replaceChildren(player);
    try {
      const loading = player.ruffle().load(watchSrc);
      if (loading && typeof loading.catch === "function") {
        loading.catch((error) => {
          showError("Could not play this SWF", error && error.message ? error.message : "Ruffle rejected the file.", watchSrc);
        });
      }
    } catch (error) {
      showError("Could not play this SWF", error && error.message ? error.message : "Ruffle rejected the file.", watchSrc);
    }
  };

  const script = document.createElement("script");
  script.src = watchRuffle;
  script.async = true;
  loadTimer = setTimeout(() => {
    fail("Ruffle is taking too long", "The player script did not finish loading. Check your connection, or run swfbox --fetch-ruffle for a local build.", watchRuffle);
  }, 20000);
  script.onload = () => {
    clearTimeout(loadTimer);
    if (settled) return;
    settled = true;
    play();
  };
  script.onerror = () => {
    fail(
      "Ruffle could not load",
      "The player script failed to load. Check the URL, or run swfbox --fetch-ruffle for a local build.",
      watchRuffle,
    );
  };
  document.head.appendChild(script);
}

mountRuffle();

document.getElementById("fullscreen").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
});
document.addEventListener("keydown", (event) => {
  if (/^(input|textarea|select)$/i.test(event.target.tagName)) return;
  const prev = document.getElementById("nav-prev");
  const next = document.getElementById("nav-next");
  if (event.key === "Escape") { location.href = "/"; }
  if (event.key === "ArrowLeft" && prev && prev.tagName === "A") { location.href = prev.href; }
  if (event.key === "ArrowRight" && next && next.tagName === "A") { location.href = next.href; }
  if (event.key === "f" || event.key === "F") {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  }
});
`;
