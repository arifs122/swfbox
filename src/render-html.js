/**
 * Static and live HTML views. Everything is inline: no fonts, no CDNs, no
 * analytics. The only optional external resource is Ruffle itself, and only
 * when the user explicitly configured (or vendored) a build.
 */

import { escapeAttr, escapeHtml, formatBytes, formatDateTime } from "./util.js";

const BOLT_PATH = "M13.2 1.6 3.9 13.9h6.2L8.7 22.4l9.8-12.9h-6.3z";

function boltSvg(className = "bolt") {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${BOLT_PATH}"/></svg>`;
}

function jsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function ruffleLabel(ruffle) {
  if (!ruffle) return "Ruffle not configured";
  if (ruffle.kind === "local") return "Ruffle · local build";
  if (ruffle.kind === "cdn") return "Ruffle · unpkg CDN";
  return "Ruffle · custom URL";
}

function ruffleTone(ruffle) {
  if (!ruffle) return "warn";
  return "ok";
}

export function pageShell({ title, description, theme, bodyClass, css, body, dataScript = "" }) {
  return `<!doctype html>
<html lang="en" data-theme="${escapeAttr(theme || "dark")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="description" content="${escapeAttr(description)}">
<title>${escapeHtml(title)}</title>
<style>${BASE_CSS}${css}</style>
</head>
<body class="${escapeAttr(bodyClass)}">
${body}
${dataScript}
</body>
</html>
`;
}

const BASE_CSS = `
:root{
  --violet:#8b5cf6; --violet-2:#a78bfa; --cyan:#22d3ee; --cyan-2:#67e8f9;
  --grad:linear-gradient(115deg,#a78bfa 0%,#8b5cf6 38%,#22d3ee 100%);
  --bg:#050814; --bg-2:#080d20; --panel:rgba(17,24,48,.66); --panel-2:rgba(12,18,38,.9);
  --card-a:rgba(23,31,61,.72); --card-b:rgba(11,16,35,.88);
  --text:#e9edff; --muted:#96a1c6; --faint:#6b769c;
  --border:rgba(148,163,255,.14); --border-strong:rgba(167,139,250,.42);
  --ok:#34d399; --warn:#fbbf24; --danger:#fb7185;
  --shadow:0 24px 70px -36px rgba(0,0,0,.95);
  --radius:18px; --radius-sm:12px;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;
  --sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
html[data-theme="light"]{
  --bg:#f4f5fc; --bg-2:#eceffb; --panel:rgba(255,255,255,.72); --panel-2:rgba(255,255,255,.94);
  --card-a:rgba(255,255,255,.86); --card-b:rgba(246,247,255,.94);
  --text:#13172e; --muted:#4b5578; --faint:#6b7494;
  --border:rgba(35,45,96,.12); --border-strong:rgba(124,58,237,.38);
  --ok:#059669; --warn:#b45309; --danger:#e11d48;
  --shadow:0 24px 60px -40px rgba(30,36,80,.5);
}
*{box-sizing:border-box}
[hidden]{display:none!important}
html{scroll-behavior:smooth}
body{
  margin:0; min-height:100vh; background:var(--bg); color:var(--text);
  font-family:var(--sans); font-size:15px; line-height:1.5;
  font-variant-numeric:tabular-nums; -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
}
body::before{
  content:""; position:fixed; inset:0; z-index:-2; pointer-events:none;
  background:
    radial-gradient(900px 520px at 12% -8%, rgba(139,92,246,.24), transparent 62%),
    radial-gradient(800px 500px at 92% 4%, rgba(34,211,238,.16), transparent 60%),
    radial-gradient(700px 600px at 55% 115%, rgba(59,130,246,.12), transparent 65%),
    linear-gradient(180deg,var(--bg) 0%,var(--bg-2) 100%);
}
html[data-theme="light"] body::before{
  background:
    radial-gradient(900px 520px at 12% -8%, rgba(139,92,246,.16), transparent 62%),
    radial-gradient(800px 500px at 92% 4%, rgba(34,211,238,.18), transparent 60%),
    linear-gradient(180deg,var(--bg) 0%,var(--bg-2) 100%);
}
body::after{
  content:""; position:fixed; inset:0; z-index:-1; pointer-events:none; opacity:.5;
  background-image:linear-gradient(rgba(148,163,255,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,255,.055) 1px,transparent 1px);
  background-size:64px 64px;
  mask-image:radial-gradient(ellipse 90% 70% at 50% 0%,#000 20%,transparent 80%);
  -webkit-mask-image:radial-gradient(ellipse 90% 70% at 50% 0%,#000 20%,transparent 80%);
}
a{color:inherit}
button,input,select{font:inherit;color:inherit}
button{cursor:pointer}
::selection{background:rgba(139,92,246,.45);color:#fff}
:focus-visible{outline:2px solid var(--cyan);outline-offset:3px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.mono{font-family:var(--mono)}
.grad-text{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.muted{color:var(--muted)}
.faint{color:var(--faint)}
code,kbd{font-family:var(--mono);font-size:.86em}
code{background:rgba(139,92,246,.13);border:1px solid rgba(139,92,246,.24);border-radius:6px;padding:.12em .42em;color:var(--violet-2)}
html[data-theme="light"] code{color:#6d28d9;background:rgba(124,58,237,.08)}
kbd{background:rgba(148,163,255,.1);border:1px solid var(--border);border-bottom-width:2px;border-radius:5px;padding:.1em .4em;color:var(--text)}
.badge{
  display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 9px;
  font-size:11px;font-weight:650;letter-spacing:.045em;text-transform:uppercase;
  border:1px solid var(--border);color:var(--muted);background:rgba(148,163,255,.07);white-space:nowrap
}
.badge.as3{color:#c4b5fd;border-color:rgba(167,139,250,.42);background:rgba(139,92,246,.16)}
.badge.as2{color:#67e8f9;border-color:rgba(34,211,238,.36);background:rgba(34,211,238,.11)}
.badge.unknown{color:var(--muted)}
.badge.broken{color:#fecdd3;border-color:rgba(251,113,133,.4);background:rgba(251,113,133,.13)}
html[data-theme="light"] .badge.as3{color:#6d28d9}
html[data-theme="light"] .badge.as2{color:#0e7490}
html[data-theme="light"] .badge.broken{color:#be123c}
.dot{width:7px;height:7px;border-radius:50%;background:var(--faint);flex:none;box-shadow:0 0 0 3px rgba(148,163,255,.08)}
.dot.ok{background:var(--ok);box-shadow:0 0 10px rgba(52,211,153,.7)}
.dot.warn{background:var(--warn);box-shadow:0 0 10px rgba(251,191,36,.6)}
.dot.bad{background:var(--danger);box-shadow:0 0 10px rgba(251,113,133,.6)}
.glass{background:linear-gradient(160deg,var(--card-a),var(--card-b));border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow)}
.kv{display:grid;grid-template-columns:auto 1fr;gap:7px 12px;margin:0 0 18px;font-size:12.5px}
.kv dt{color:var(--faint);font-size:11px;text-transform:uppercase;letter-spacing:.07em;padding-top:1px}
.kv dd{margin:0;text-align:right;color:var(--text);overflow-wrap:anywhere}
.meta-block{margin:0 0 16px;padding:11px 12px;border-radius:10px;border:1px solid var(--border);background:rgba(139,92,246,.05)}
.meta-block p{margin:0;font-size:12.5px;color:var(--muted)}
.meta-block strong{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin-bottom:5px}
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:7px;text-decoration:none;
  padding:10px 13px;border-radius:10px;border:1px solid var(--border);font-size:12.5px;font-weight:650;color:var(--text);background:transparent
}
.btn:hover{border-color:var(--border-strong)}
.btn.primary{background:var(--grad);color:#080b18;border-color:transparent}
.hint{margin:0;font-size:11.5px;color:var(--faint);line-height:1.45}
.hint code{font-size:.92em}
`;

const LIBRARY_CSS = `
.wrap{max-width:1180px;margin:0 auto;padding:0 22px}
.hero{padding-top:26px}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:11px;text-decoration:none;font-weight:750;letter-spacing:-.02em;font-size:17px}
.brand-mark{
  width:36px;height:36px;border-radius:11px;display:grid;place-items:center;
  background:var(--grad);box-shadow:0 8px 26px -10px rgba(139,92,246,.85)
}
.brand-mark .bolt{width:20px;height:20px;fill:#070a18}
.brand-sub{color:var(--faint);font-weight:500;font-size:12px;letter-spacing:.02em;margin-left:2px}
.top-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.pill-status{
  display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;
  border:1px solid var(--border);background:var(--panel);backdrop-filter:blur(12px);
  font-size:12px;color:var(--muted);white-space:nowrap
}
.pill-status strong{color:var(--text);font-weight:600}
.icon-btn{
  width:38px;height:38px;border-radius:11px;border:1px solid var(--border);
  background:var(--panel);display:grid;place-items:center;backdrop-filter:blur(12px)
}
.icon-btn:hover{border-color:var(--border-strong)}
.icon-btn svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.hero-copy{padding:58px 0 34px;max-width:810px}
.eyebrow{
  margin:0 0 14px;font-size:11px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;
  color:var(--cyan);display:flex;align-items:center;gap:10px
}
.eyebrow::before{content:"";width:26px;height:1px;background:linear-gradient(90deg,var(--violet),var(--cyan))}
h1{margin:0;font-size:clamp(2.35rem,6vw,4.4rem);line-height:1.02;letter-spacing:-.045em;font-weight:800}
.lede{margin:20px 0 0;font-size:clamp(1rem,1.6vw,1.12rem);color:var(--muted);max-width:660px}
.hero-path{display:flex;align-items:center;gap:8px;margin-top:20px;font-size:12px;color:var(--faint);font-family:var(--mono);max-width:100%;width:fit-content}
.hero-path svg{width:14px;height:14px;fill:var(--violet);flex:none}
.hero-path span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:6px 0 40px}
.stat{padding:16px 18px;border-radius:14px;position:relative;overflow:hidden}
.stat::after{content:"";position:absolute;inset:0 0 auto;height:2px;background:var(--grad);opacity:.7}
.stat b{display:block;font-size:clamp(1.35rem,2.6vw,1.8rem);letter-spacing:-.03em;font-weight:750}
.stat span{display:block;color:var(--faint);font-size:11px;text-transform:uppercase;letter-spacing:.13em;margin-top:3px}
main{padding-bottom:70px}
.toolbar{
  position:sticky;top:10px;z-index:30;display:flex;flex-direction:column;gap:12px;
  padding:14px;border-radius:16px;background:var(--panel-2);border:1px solid var(--border);
  backdrop-filter:blur(20px);box-shadow:0 18px 50px -34px rgba(0,0,0,.9);margin-bottom:22px
}
.toolbar-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.search{position:relative;flex:1 1 280px;min-width:210px}
.search svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:16px;height:16px;fill:none;stroke:var(--faint);stroke-width:1.8;stroke-linecap:round}
.search input{
  width:100%;padding:11px 38px 11px 38px;border-radius:11px;border:1px solid var(--border);
  background:rgba(5,8,20,.55);color:var(--text);outline:none;font-size:14px
}
html[data-theme="light"] .search input{background:rgba(255,255,255,.8)}
.search input::placeholder{color:var(--faint)}
.search input:focus{border-color:var(--border-strong);box-shadow:0 0 0 3px rgba(139,92,246,.16)}
.search .slash{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:11px;color:var(--faint)}
.select-wrap{position:relative}
select{
  appearance:none;padding:11px 34px 11px 12px;border-radius:11px;border:1px solid var(--border);
  background:rgba(5,8,20,.55);font-size:13px;color:var(--muted);outline:none
}
html[data-theme="light"] select{background:rgba(255,255,255,.8)}
.select-wrap::after{content:"";position:absolute;right:14px;top:50%;width:6px;height:6px;border-right:1.5px solid var(--faint);border-bottom:1.5px solid var(--faint);transform:translateY(-70%) rotate(45deg);pointer-events:none}
.chips{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.chip{
  display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:999px;
  border:1px solid var(--border);background:transparent;color:var(--muted);font-size:12px;font-weight:600
}
.chip:hover{border-color:var(--border-strong);color:var(--text)}
.chip[aria-pressed="true"]{background:var(--grad);border-color:transparent;color:#090c1a;box-shadow:0 6px 20px -12px rgba(139,92,246,.9)}
.chip .n{font-variant-numeric:tabular-nums;opacity:.75;font-weight:700}
.result-count{margin-left:auto;font-size:12px;color:var(--faint);white-space:nowrap}
.notice{
  margin:0 0 18px;padding:11px 14px;border-radius:11px;border:1px solid rgba(251,191,36,.28);
  background:rgba(251,191,36,.08);color:#fde68a;font-size:12.5px
}
html[data-theme="light"] .notice{color:#92400e}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:16px}
.card{
  position:relative;display:flex;flex-direction:column;text-align:left;border-radius:var(--radius);
  border:1px solid var(--border);background:linear-gradient(165deg,var(--card-a),var(--card-b));
  overflow:hidden;box-shadow:0 14px 34px -30px rgba(0,0,0,.9);
  transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;cursor:pointer
}
.card:hover{transform:translateY(-3px);border-color:var(--border-strong);box-shadow:0 24px 52px -30px rgba(34,211,238,.32),0 12px 36px -26px rgba(139,92,246,.55)}
.card:focus-visible{outline:2px solid var(--cyan);outline-offset:3px}
.card.is-broken{border-color:rgba(251,113,133,.24)}
.card.is-broken:hover{border-color:rgba(251,113,133,.5);box-shadow:0 22px 46px -30px rgba(251,113,133,.32)}
.thumb{
  height:184px;margin:9px 9px 0;border-radius:13px;position:relative;overflow:hidden;
  display:flex;align-items:center;justify-content:center;
  background:
    radial-gradient(80% 80% at 50% 0%,rgba(139,92,246,.24),transparent 70%),
    linear-gradient(150deg,#0b1124,#070b18);
  border:1px solid rgba(148,163,255,.08)
}
html[data-theme="light"] .thumb{background:radial-gradient(80% 80% at 50% 0%,rgba(139,92,246,.16),transparent 70%),linear-gradient(150deg,#eef1ff,#e6eafb)}
.thumb::before{
  content:"";position:absolute;inset:0;opacity:.5;
  background-image:linear-gradient(rgba(148,163,255,.09) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,255,.09) 1px,transparent 1px);
  background-size:22px 22px;mask-image:radial-gradient(circle at 50% 45%,#000,transparent 78%);
  -webkit-mask-image:radial-gradient(circle at 50% 45%,#000,transparent 78%)
}
.thumb-screen{
  position:relative;border-radius:6px;max-width:90%;max-height:158px;
  border:1px solid rgba(167,139,250,.4);
  background:linear-gradient(145deg,rgba(139,92,246,.38),rgba(34,211,238,.18));
  box-shadow:0 10px 30px -14px rgba(34,211,238,.5),inset 0 0 0 1px rgba(255,255,255,.06);
  display:grid;place-items:center;overflow:hidden;flex:none
}
.thumb-screen::before{
  content:"";position:absolute;inset:0;
  background:linear-gradient(135deg,rgba(255,255,255,.16),transparent 45%)
}
.thumb-bolt{width:26px;height:26px;fill:rgba(255,255,255,.92);filter:drop-shadow(0 3px 10px rgba(34,211,238,.7))}
.card.is-broken .thumb-screen{background:linear-gradient(145deg,rgba(251,113,133,.26),rgba(120,30,52,.24));border-color:rgba(251,113,133,.42);box-shadow:none}
.card.is-broken .thumb-bolt{fill:rgba(254,205,211,.8);filter:none}
.thumb-tag{position:absolute;left:10px;top:10px;z-index:2}
.thumb-play{
  position:absolute;inset:auto 12px 10px auto;z-index:2;display:inline-flex;align-items:center;gap:6px;
  padding:6px 10px;border-radius:999px;background:rgba(5,8,20,.72);border:1px solid rgba(148,163,255,.24);
  color:#dbe4ff;font-size:11px;font-weight:650;opacity:0;transform:translateY(4px);transition:.18s
}
.card:hover .thumb-play,.card:focus-visible .thumb-play{opacity:1;transform:none}
.thumb-play svg{width:9px;height:9px;fill:currentColor}
.card-body{padding:13px 15px 15px;display:flex;flex-direction:column;gap:10px;flex:1}
.card-title{
  margin:0;font-size:14.5px;line-height:1.28;font-weight:680;letter-spacing:-.012em;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.55em
}
.card-meta{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;margin:0;font-size:11.5px}
.card-meta dt{color:var(--faint);text-transform:uppercase;letter-spacing:.08em;font-size:10px;padding-top:1px}
.card-meta dd{margin:0;color:var(--muted);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-foot{
  margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:8px;
  padding-top:10px;border-top:1px solid var(--border);font-size:11px;color:var(--faint)
}
.card-path{font-family:var(--mono);font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left;max-width:64%}
.card-size{white-space:nowrap}
.load-more{display:flex;justify-content:center;margin:24px 0 0}
.load-more button{
  padding:10px 18px;border-radius:999px;border:1px solid var(--border);background:var(--panel);
  color:var(--text);font-size:13px;font-weight:600
}
.load-more button:hover{border-color:var(--border-strong)}
.empty{
  text-align:center;padding:64px 20px;border:1px dashed var(--border);border-radius:var(--radius);
  background:rgba(148,163,255,.03);margin-top:6px
}
.empty .bolt{width:34px;height:34px;fill:var(--violet);opacity:.7;margin-bottom:12px}
.empty h3{margin:0 0 6px;font-size:18px;letter-spacing:-.02em}
.empty p{margin:0;color:var(--muted);font-size:13px}
.broken-section{margin-top:52px}
.section-head{display:flex;align-items:baseline;gap:12px;margin-bottom:6px}
.section-head h2{margin:0;font-size:20px;letter-spacing:-.025em}
.section-head .n{color:var(--danger);font-size:12px;font-weight:700;padding:3px 8px;border-radius:999px;background:rgba(251,113,133,.12);border:1px solid rgba(251,113,133,.28)}
.section-note{margin:0 0 16px;color:var(--faint);font-size:12.5px}
.broken-list{display:flex;flex-direction:column;gap:8px}
.broken-row{
  display:grid;grid-template-columns:26px minmax(0,1.1fr) minmax(0,1.9fr) auto;align-items:center;gap:12px;
  padding:11px 14px;border-radius:11px;border:1px solid rgba(251,113,133,.16);
  background:rgba(251,113,133,.045);text-align:left;width:100%
}
.broken-row:hover{border-color:rgba(251,113,133,.36);background:rgba(251,113,133,.075)}
.broken-row .mark{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:rgba(251,113,133,.14);color:var(--danger);font-weight:800;font-size:13px}
.broken-name{font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.broken-path{font-family:var(--mono);font-size:11px;color:var(--faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.broken-error{font-size:11.5px;color:#fda4af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
html[data-theme="light"] .broken-error{color:#be123c}
.broken-more{margin:10px 0 0;font-size:12px;color:var(--faint)}
.site-foot{
  border-top:1px solid var(--border);padding:26px 0 38px;display:flex;justify-content:space-between;
  gap:16px;flex-wrap:wrap;color:var(--faint);font-size:11.5px
}
.site-foot .brand{font-size:13px;color:var(--muted);font-weight:600}
.site-foot .brand-mark{width:24px;height:24px;border-radius:7px}
.site-foot .brand-mark .bolt{width:13px;height:13px}
dialog.detail{
  width:min(1120px,94vw);max-height:92vh;padding:0;border:1px solid var(--border);
  border-radius:20px;background:var(--panel-2);color:var(--text);overflow:auto;
  box-shadow:0 50px 140px -30px rgba(0,0,0,.9)
}
dialog.detail::backdrop{background:rgba(3,5,14,.72);backdrop-filter:blur(9px)}
.detail-shell{display:flex;flex-direction:column;min-height:min(620px,84vh)}
.detail-head{
  display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px 14px;
  border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--panel-2);z-index:5
}
.detail-head h2{margin:0;font-size:19px;letter-spacing:-.025em;line-height:1.25;overflow-wrap:anywhere}
.detail-sub{margin:5px 0 0;font-family:var(--mono);font-size:11px;color:var(--faint);overflow-wrap:anywhere}
.detail-badges{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.detail-close{
  width:36px;height:36px;border-radius:10px;border:1px solid var(--border);background:transparent;
  display:grid;place-items:center;flex:none
}
.detail-close:hover{border-color:var(--border-strong)}
.detail-close svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
.detail-body{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(280px,.9fr);gap:0;flex:1}
.detail-stage-wrap{padding:18px 20px 20px;display:flex;flex-direction:column;gap:12px;min-width:0}
.detail-stage{
  position:relative;border-radius:13px;overflow:hidden;border:1px solid var(--border);
  background:radial-gradient(90% 90% at 50% 0%,#0e1530,#05070f);
  min-height:300px;flex:1;display:flex;align-items:center;justify-content:center
}
.detail-stage ruffle-player{width:100%;height:100%;position:absolute;inset:0}
.detail-nav{display:flex;align-items:center;justify-content:space-between;gap:10px}
.detail-nav button{
  padding:8px 12px;border-radius:9px;border:1px solid var(--border);background:transparent;
  font-size:12px;color:var(--muted)
}
.detail-nav button:hover:not(:disabled){border-color:var(--border-strong);color:var(--text)}
.detail-nav button:disabled{opacity:.35;cursor:default}
.detail-nav .pos{font-size:11px;color:var(--faint);font-variant-numeric:tabular-nums}
.detail-side{border-left:1px solid var(--border);padding:18px 20px;background:rgba(5,8,20,.2);overflow:auto}
html[data-theme="light"] .detail-side{background:rgba(245,246,252,.5)}
.detail-side h3{margin:0 0 10px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.side-actions{display:flex;flex-direction:column;gap:8px;margin-top:4px}
.fallback{padding:30px 24px;text-align:center;max-width:420px}
.fallback-icon{
  width:52px;height:52px;border-radius:14px;display:grid;place-items:center;margin:0 auto 14px;
  background:rgba(139,92,246,.14);border:1px solid rgba(139,92,246,.3);color:var(--violet-2)
}
.fallback-icon svg{width:24px;height:24px;fill:currentColor}
.fallback h3{margin:0 0 8px;font-size:16px;letter-spacing:-.02em}
.fallback p{margin:0 0 9px;color:var(--muted);font-size:12.5px;line-height:1.55}
.fallback .cmd{
  display:block;margin:12px auto 4px;padding:10px;border-radius:8px;background:rgba(5,8,20,.5);
  border:1px solid var(--border);font-family:var(--mono);font-size:11.5px;color:var(--cyan-2);max-width:320px;overflow-wrap:anywhere
}
html[data-theme="light"] .fallback .cmd{background:rgba(255,255,255,.75);color:#0e7490}
.spinner{
  width:26px;height:26px;border-radius:50%;border:2px solid rgba(148,163,255,.2);
  border-top-color:var(--cyan);animation:spin .8s linear infinite;margin:0 auto 12px
}
@keyframes spin{to{transform:rotate(360deg)}}
.stage-loading{text-align:center;color:var(--muted);font-size:12px}
.stage-error{color:#fda4af;font-size:11.5px;margin-top:8px;overflow-wrap:anywhere}
@media (max-width:860px){
  .stats{grid-template-columns:repeat(2,1fr)}
  .detail-body{grid-template-columns:1fr}
  .detail-side{border-left:0;border-top:1px solid var(--border)}
  .detail-stage{min-height:250px}
}
@media (max-width:560px){
  .wrap{padding:0 15px}
  .hero-copy{padding:40px 0 26px}
  .toolbar{top:6px}
  .grid{grid-template-columns:1fr}
  .broken-row{grid-template-columns:24px 1fr auto}
  .broken-path{display:none}
  .broken-error{grid-column:2/-1;white-space:normal}
  .result-count{margin-left:0;width:100%}
}
@media (prefers-reduced-motion:reduce){
  *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}
}
`;

export const PLAYER_CSS = `
.player-page{height:100vh;overflow:hidden;display:flex;flex-direction:column;background:#04060f}
html[data-theme="light"] .player-page{background:var(--bg)}
.watch-top{
  height:58px;flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:0 16px;border-bottom:1px solid var(--border);background:var(--panel-2);backdrop-filter:blur(16px);z-index:10
}
.watch-left{display:flex;align-items:center;gap:12px;min-width:0}
.back-link{
  display:inline-flex;align-items:center;gap:6px;text-decoration:none;color:var(--muted);
  font-size:12.5px;font-weight:600;padding:7px 10px;border-radius:8px;border:1px solid transparent;white-space:nowrap
}
.back-link:hover{color:var(--text);border-color:var(--border);background:rgba(148,163,255,.05)}
.back-link svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.watch-title{min-width:0}
.watch-title h1{margin:0;font-size:13.5px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.01em}
.watch-title p{margin:1px 0 0;font-size:10.5px;color:var(--faint);font-family:var(--mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.watch-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.watch-right .pill-status{font-size:11px;padding:5px 10px}
.watch-right .icon-btn{width:32px;height:32px;border-radius:8px}
.watch-right .icon-btn svg{width:14px;height:14px}
.watch-body{flex:1;display:grid;grid-template-columns:minmax(0,1fr) 340px;min-height:0}
.watch-stage-wrap{position:relative;display:flex;flex-direction:column;min-width:0;min-height:0;padding:14px;gap:10px}
.watch-stage{
  position:relative;flex:1;min-height:0;border-radius:12px;overflow:hidden;
  border:1px solid var(--border);background:radial-gradient(80% 90% at 50% 0%,#0a1128,#03050c);
  display:grid;place-items:center
}
.watch-stage ruffle-player{width:100%;height:100%;position:absolute;inset:0}
.watch-under{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;font-size:11.5px;color:var(--faint);min-height:26px}
.watch-nav{display:flex;align-items:center;gap:8px}
.watch-nav a,.watch-nav span{
  display:inline-flex;align-items:center;gap:6px;text-decoration:none;padding:6px 10px;border-radius:7px;
  border:1px solid var(--border);color:var(--muted);font-size:11.5px;background:rgba(148,163,255,.03)
}
.watch-nav a:hover{border-color:var(--border-strong);color:var(--text)}
.watch-nav .disabled{opacity:.35;pointer-events:none}
.watch-side{
  border-left:1px solid var(--border);background:rgba(9,13,30,.55);overflow:auto;padding:18px 18px 30px;min-height:0
}
html[data-theme="light"] .watch-side{background:rgba(255,255,255,.55)}
.watch-side h2{margin:0 0 6px;font-size:16px;letter-spacing:-.02em;overflow-wrap:anywhere}
.watch-side .side-path{margin:0 0 14px;font-family:var(--mono);font-size:10.5px;color:var(--faint);overflow-wrap:anywhere}
.watch-side h3{margin:20px 0 9px;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--faint)}
.watch-side .kv{font-size:12px}
.watch-side .kv dd{text-align:right}
.shortcuts{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px;font-size:11.5px;color:var(--muted)}
.shortcuts li{display:flex;justify-content:space-between;gap:10px;align-items:center}
.shortcuts kbd{font-size:10px}
.watch-fallback{padding:24px;max-width:480px;text-align:center}
.watch-loading{display:flex;flex-direction:column;align-items:center;gap:12px;color:var(--muted);font-size:12.5px}
.watch-loading .spinner{margin:0}
.watch-fallback h2{margin:0 0 8px;font-size:18px}
.watch-fallback p{color:var(--muted);font-size:12.5px;margin:0 0 10px;line-height:1.6}
.watch-fallback .cmd{display:inline-block;margin:8px 0 0;padding:10px 13px;border-radius:8px;border:1px solid var(--border);background:rgba(5,8,20,.5);font-family:var(--mono);font-size:11.5px;color:var(--cyan-2)}
.watch-fallback .btn{margin-top:12px}
.watch-loading .faint{font-size:11px}
@media (max-width:800px){
  .player-page{height:auto;overflow:auto}
  .watch-body{grid-template-columns:1fr}
  .watch-stage{min-height:52vh}
  .watch-side{border-left:0;border-top:1px solid var(--border);overflow:visible}
  .watch-title{display:none}
}
`;

const SEARCH_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4.2-4.2"></path></svg>';

function clientPayload(library) {
  return {
    name: library.name,
    version: library.version,
    mode: library.mode,
    theme: library.theme,
    root: library.root,
    rootName: library.rootName,
    generatedAt: library.generatedAt,
    counts: library.counts,
    totalBytes: library.totalBytes,
    capped: library.capped,
    maxFiles: library.maxFiles,
    ruffle: library.ruffle
      ? { url: library.ruffle.url, kind: library.ruffle.kind, label: ruffleLabel(library.ruffle) }
      : null,
    entries: library.entries.map((entry) => ({
      title: entry.title,
      name: entry.name,
      relativePath: entry.relativePath,
      src: entry.src,
      playerUrl: entry.playerUrl,
      kind: entry.kind,
      broken: entry.broken,
      error: entry.error,
      size: entry.size,
      sizeLabel: entry.sizeLabel,
      modified: entry.modified,
      width: entry.width,
      height: entry.height,
      dimensions: entry.dimensions,
      frameRate: entry.frameRate,
      frameCount: entry.frameCount,
      asVersion: entry.asVersion,
      version: entry.version,
      compression: entry.compression,
      signature: entry.signature,
      tagCount: entry.tagCount,
      spriteCount: entry.spriteCount,
      shapeCount: entry.shapeCount,
      soundCount: entry.soundCount,
      videoCount: entry.videoCount,
      backgroundColor: entry.backgroundColor,
      truncated: entry.truncated,
      useNetwork: entry.useNetwork,
      metadata: entry.metadata,
    })),
  };
}

function statBlock(value, label) {
  return `<div class="stat glass"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`;
}

export function renderHtml(library) {
  const data = clientPayload(library);
  const theme = library.theme || "dark";
  const ruffle = library.ruffle;
  const totalLabel = formatBytes(library.totalBytes);
  const warnings = [...(library.warnings || [])];

  const body = `
<div class="wrap">
  <header class="hero">
    <div class="topbar">
      <div class="brand">
        <span class="brand-mark">${boltSvg()}</span>
        <span>swfbox</span>
        <span class="brand-sub">offline flash library</span>
      </div>
      <div class="top-actions">
        <span class="pill-status" title="${escapeAttr(ruffle ? ruffle.url || "" : "")}">
          <span class="dot ${ruffleTone(ruffle)}"></span>
          <strong>${escapeHtml(ruffleLabel(ruffle))}</strong>
        </span>
        <button class="icon-btn" id="theme-toggle" type="button" aria-label="Toggle colour theme" title="Toggle colour theme">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z"></path></svg>
        </button>
      </div>
    </div>
    <div class="hero-copy">
      <p class="eyebrow">${library.mode === "serve" ? "Served locally" : "Static archive report"}</p>
      <h1>Every SWF,<br><span class="grad-text">one shelf.</span></h1>
      <p class="lede">${library.counts.total === 0 ? "No SWF files were found here yet." : `${library.counts.readable} playable ${library.counts.readable === 1 ? "title" : "titles"} indexed from <strong>${escapeHtml(library.rootName)}</strong>. Search, inspect and play through Ruffle — no account, no cloud, no telemetry.`}</p>
      <div class="hero-path">${boltSvg()}<span>${escapeHtml(library.root)}</span></div>
    </div>
    <div class="stats">
      ${statBlock(String(library.counts.total), "SWF files")}
      ${statBlock(String(library.counts.readable), "Readable")}
      ${statBlock(String(library.counts.broken), "Unreadable")}
      ${statBlock(totalLabel, "On disk")}
    </div>
  </header>

  <main>
    ${warnings.length > 0 ? `<p class="notice">${escapeHtml(warnings.slice(0, 3).join(" · "))}${warnings.length > 3 ? ` · +${warnings.length - 3} more` : ""}</p>` : ""}
    <section class="toolbar" aria-label="Library controls">
      <div class="toolbar-row">
        <label class="search">
          <span class="sr-only">Search the library</span>
          ${SEARCH_ICON}
          <input id="search" type="search" autocomplete="off" spellcheck="false" placeholder="Search title, filename or path…">
          <span class="slash">/</span>
        </label>
        <div class="select-wrap">
          <label class="sr-only" for="sort">Sort files</label>
          <select id="sort">
            <option value="name">Name A–Z</option>
            <option value="size">Largest first</option>
            <option value="frames">Most frames</option>
            <option value="modified">Newest first</option>
          </select>
        </div>
        <span class="result-count" id="result-count"></span>
      </div>
      <div class="toolbar-row">
        <div class="chips" id="chips" role="group" aria-label="Filter by ActionScript version">
          <button class="chip" data-filter="all" aria-pressed="true" type="button">All <span class="n">${library.counts.total}</span></button>
          <button class="chip" data-filter="as3" aria-pressed="false" type="button">AS3 <span class="n">${library.counts.as3}</span></button>
          <button class="chip" data-filter="as2" aria-pressed="false" type="button">AS2 <span class="n">${library.counts.as2}</span></button>
          <button class="chip" data-filter="unknown" aria-pressed="false" type="button">Unknown <span class="n">${library.counts.unknown}</span></button>
          <button class="chip" data-filter="broken" aria-pressed="false" type="button">Broken <span class="n">${library.counts.broken}</span></button>
        </div>
      </div>
    </section>

    <section class="grid" id="grid" aria-label="SWF files"></section>
    <div class="load-more" id="load-more-wrap" hidden><button type="button" id="load-more">Show more files</button></div>

    <div class="empty" id="empty" hidden>
      ${boltSvg()}
      <h3>Nothing matches</h3>
      <p id="empty-text">Try a different search term or filter.</p>
    </div>

    <section class="broken-section" id="broken-section" hidden>
      <div class="section-head"><h2>Could not read</h2><span class="n" id="broken-count"></span></div>
      <p class="section-note">These files are still in the index. An old archive always has a few — the error is shown so you know what happened.</p>
      <div class="broken-list" id="broken-list"></div>
      <p class="broken-more" id="broken-more" hidden></p>
    </section>
  </main>

  <footer class="site-foot">
    <span class="brand"><span class="brand-mark">${boltSvg()}</span> swfbox ${escapeHtml(library.version)}</span>
    <span>Plays through Ruffle (ruffle.rs) · ${ruffle ? escapeHtml(ruffleLabel(ruffle)) : "no Ruffle configured"} · Generated ${escapeHtml(formatDateTime(library.generatedAt))}</span>
  </footer>
</div>

<dialog class="detail" id="detail" aria-labelledby="detail-title">
  <div class="detail-shell">
    <header class="detail-head">
      <div>
        <h2 id="detail-title">File</h2>
        <p class="detail-sub" id="detail-sub"></p>
        <div class="detail-badges" id="detail-badges"></div>
      </div>
      <button class="detail-close" id="detail-close" type="button" aria-label="Close player">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>
      </button>
    </header>
    <div class="detail-body">
      <div class="detail-stage-wrap">
        <div class="detail-stage" id="detail-stage"></div>
        <div class="detail-nav">
          <button type="button" id="detail-prev">← Previous</button>
          <span class="pos" id="detail-pos"></span>
          <button type="button" id="detail-next">Next →</button>
        </div>
      </div>
      <aside class="detail-side" id="detail-side"></aside>
    </div>
  </div>
</dialog>
`;

  return pageShell({
    title: `swfbox — ${library.rootName} (${library.counts.total} SWF)`,
    description: `Offline SWF library: ${library.counts.total} files indexed from ${library.rootName}. Inspect and play through Ruffle.`,
    theme,
    bodyClass: "library-page",
    css: LIBRARY_CSS,
    body,
    dataScript: `<script id="library-data" type="application/json">${jsonForHtml(data)}</script>
<script>${LIBRARY_JS}</script>`,
  });
}

const LIBRARY_JS = String.raw`
const DATA = JSON.parse(document.getElementById("library-data").textContent);
const state = { query: "", filter: "all", sort: "name", limit: 120 };
const grid = document.getElementById("grid");
const empty = document.getElementById("empty");
const emptyText = document.getElementById("empty-text");
const resultCount = document.getElementById("result-count");
const loadMoreWrap = document.getElementById("load-more-wrap");
const loadMore = document.getElementById("load-more");
const dialog = document.getElementById("detail");
const stage = document.getElementById("detail-stage");
const side = document.getElementById("detail-side");
let current = [];
let currentIndex = -1;
let rufflePromise = null;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function hasText(value) { return typeof value === "string" && value.trim().length > 0; }
function fmtNumber(value) { return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-US") : "—"; }
function ratioOf(entry) {
  const w = Number(entry.width), h = Number(entry.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 4 / 3;
  return Math.max(0.05, Math.min(20, w / h));
}
function kindLabel(kind) {
  return kind === "as3" ? "AS3" : kind === "as2" ? "AS2" : kind === "broken" ? "Broken" : "Unknown";
}
function badge(kind) {
  const span = el("span", "badge " + kind, kindLabel(kind));
  return span;
}
function playIcon() {
  const wrap = document.createElement("span");
  wrap.innerHTML = '<svg viewBox="0 0 10 12" aria-hidden="true"><path d="M0 0l10 6-10 6z"></path></svg>';
  return wrap.firstChild;
}

function makeCard(entry) {
  const card = el("article", "card" + (entry.broken ? " is-broken" : ""));
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", (entry.broken ? "View error for " : "Open ") + entry.title);

  const thumb = el("div", "thumb");
  const screen = el("div", "thumb-screen");
  const ratio = ratioOf(entry);
  screen.style.width = "calc(158px * " + ratio.toFixed(4) + ")";
  screen.style.aspectRatio = ratio.toFixed(4);
  screen.innerHTML = '<svg viewBox="0 0 24 24" class="thumb-bolt" aria-hidden="true"><path d="M13.2 1.6 3.9 13.9h6.2L8.7 22.4l9.8-12.9h-6.3z"></path></svg>';
  thumb.appendChild(screen);

  const tag = el("span", "thumb-tag");
  tag.appendChild(badge(entry.kind));
  thumb.appendChild(tag);

  const play = el("span", "thumb-play");
  play.appendChild(playIcon());
  play.appendChild(document.createTextNode(entry.broken ? "Details" : "Play"));
  thumb.appendChild(play);
  card.appendChild(thumb);

  const body = el("div", "card-body");
  body.appendChild(el("h3", "card-title", entry.title));

  const meta = el("dl", "card-meta");
  const rows = [
    ["Stage", entry.dimensions || "unknown"],
    ["FPS", entry.frameRate !== null && entry.frameRate !== undefined ? entry.frameRate + " fps" : "—"],
    ["Frames", fmtNumber(entry.frameCount)],
  ];
  for (const [key, value] of rows) {
    meta.appendChild(el("dt", null, key));
    meta.appendChild(el("dd", null, value));
  }
  body.appendChild(meta);

  const foot = el("div", "card-foot");
  foot.appendChild(el("span", "card-path", entry.relativePath));
  foot.appendChild(el("span", "card-size", entry.sizeLabel + " · " + (entry.modified ? entry.modified.slice(0, 10) : "no date")));
  body.appendChild(foot);
  card.appendChild(body);

  card.addEventListener("click", () => openEntry(entry));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openEntry(entry);
    }
  });
  return card;
}

function compare(a, b) {
  if (state.sort === "size") return (b.size || 0) - (a.size || 0) || a.title.localeCompare(b.title);
  if (state.sort === "frames") return (b.frameCount || 0) - (a.frameCount || 0) || a.title.localeCompare(b.title);
  if (state.sort === "modified") {
    const at = a.modified ? Date.parse(a.modified) : 0;
    const bt = b.modified ? Date.parse(b.modified) : 0;
    return bt - at || a.title.localeCompare(b.title);
  }
  return a.title.localeCompare(b.title, "en", { sensitivity: "base" }) || a.relativePath.localeCompare(b.relativePath);
}

function filtered() {
  const q = state.query.trim().toLowerCase();
  return DATA.entries
    .filter((entry) => {
      if (state.filter !== "all") {
        if (state.filter === "broken") { if (!entry.broken) return false; }
        else if (entry.kind !== state.filter) return false;
      }
      if (!q) return true;
      const haystack = [entry.title, entry.name, entry.relativePath, entry.metadata && entry.metadata.creator, entry.metadata && entry.metadata.description]
        .filter(hasText).join(" ").toLowerCase();
      return haystack.includes(q);
    })
    .sort(compare);
}

function render() {
  current = filtered();
  const shown = current.slice(0, state.limit);
  grid.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const entry of shown) fragment.appendChild(makeCard(entry));
  grid.appendChild(fragment);
  resultCount.textContent = current.length + " of " + DATA.entries.length + " files";
  empty.hidden = current.length !== 0;
  if (current.length === 0) {
    emptyText.textContent = DATA.entries.length === 0
      ? "No .swf files were found in this folder. Point swfbox at an archive that contains some."
      : "Try a different search term or filter.";
  }
  loadMoreWrap.hidden = current.length <= state.limit;
  const remaining = Math.max(0, current.length - state.limit);
  loadMore.textContent = "Show " + Math.min(120, remaining) + " more files (" + remaining + " hidden)";
}

document.getElementById("chips").addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  state.filter = chip.dataset.filter;
  state.limit = 120;
  for (const button of document.querySelectorAll(".chip")) {
    button.setAttribute("aria-pressed", String(button === chip));
  }
  render();
});

document.getElementById("search").addEventListener("input", (event) => {
  state.query = event.target.value;
  state.limit = 120;
  render();
});

document.getElementById("sort").addEventListener("change", (event) => {
  state.sort = event.target.value;
  render();
});

loadMore.addEventListener("click", () => {
  state.limit += 120;
  render();
});

function renderBroken() {
  const broken = DATA.entries.filter((entry) => entry.broken);
  const section = document.getElementById("broken-section");
  const list = document.getElementById("broken-list");
  section.hidden = broken.length === 0;
  document.getElementById("broken-count").textContent = String(broken.length);
  const rows = broken.slice(0, 100);
  list.replaceChildren();
  for (const entry of rows) {
    const row = el("button", "broken-row");
    row.type = "button";
    row.appendChild(el("span", "mark", "!"));
    const name = el("span", "broken-name", entry.title);
    name.title = entry.relativePath;
    row.appendChild(name);
    row.appendChild(el("span", "broken-path", entry.relativePath));
    row.appendChild(el("span", "broken-error", entry.error || "Unreadable file"));
    row.addEventListener("click", () => openEntry(entry));
    list.appendChild(row);
  }
  const more = document.getElementById("broken-more");
  if (broken.length > rows.length) {
    more.hidden = false;
    more.textContent = "Showing the first " + rows.length + " of " + broken.length + " unreadable files.";
  }
}

function row(dl, key, value, mono) {
  dl.appendChild(el("dt", null, key));
  const dd = el("dd", mono ? "mono" : null, value === null || value === undefined || value === "" ? "—" : String(value));
  dl.appendChild(dd);
}

function fillSide(entry) {
  side.replaceChildren();
  side.appendChild(el("h3", null, "File details"));
  const kv = el("dl", "kv");
  row(kv, "Stage", entry.dimensions ? entry.dimensions + " px" : "unknown");
  row(kv, "Frame rate", entry.frameRate !== null && entry.frameRate !== undefined ? entry.frameRate + " fps" : "unknown");
  row(kv, "Frames", fmtNumber(entry.frameCount));
  row(kv, "ActionScript", entry.asVersion ? "AS" + entry.asVersion : "not declared");
  row(kv, "SWF version", entry.version !== null && entry.version !== undefined ? "v" + entry.version : "—");
  row(kv, "Compression", entry.compression || "—");
  row(kv, "Size", entry.sizeLabel);
  row(kv, "Modified", entry.modified ? entry.modified.slice(0, 10) : "unknown");
  row(kv, "Tags", fmtNumber(entry.tagCount));
  row(kv, "Sprites", fmtNumber(entry.spriteCount));
  row(kv, "Shapes", fmtNumber(entry.shapeCount));
  row(kv, "Sounds", fmtNumber(entry.soundCount));
  row(kv, "Video", fmtNumber(entry.videoCount));
  if (entry.backgroundColor) row(kv, "Background", entry.backgroundColor);
  side.appendChild(kv);

  if (entry.metadata && (hasText(entry.metadata.creator) || hasText(entry.metadata.description))) {
    side.appendChild(el("h3", null, "Embedded metadata"));
    if (hasText(entry.metadata.creator)) {
      const block = el("div", "meta-block");
      block.appendChild(el("strong", null, "Creator"));
      block.appendChild(el("p", null, entry.metadata.creator));
      side.appendChild(block);
    }
    if (hasText(entry.metadata.description)) {
      const block = el("div", "meta-block");
      block.appendChild(el("strong", null, "Description"));
      block.appendChild(el("p", null, entry.metadata.description));
      side.appendChild(block);
    }
  }

  side.appendChild(el("h3", null, "Path"));
  const pathBlock = el("div", "meta-block");
  pathBlock.appendChild(el("p", "mono", entry.relativePath));
  side.appendChild(pathBlock);

  const actions = el("div", "side-actions");
  if (entry.playerUrl) {
    const link = el("a", "btn primary", "Open full player");
    link.href = entry.playerUrl;
    actions.appendChild(link);
  }
  if (DATA.mode === "static") {
    actions.appendChild(el("p", "hint", "Opened from a local file? Browsers block file:// SWF reads. Run swfbox serve for guaranteed playback."));
  }
  if (DATA.ruffle && DATA.ruffle.kind !== "local" && DATA.mode === "serve") {
    actions.appendChild(el("p", "hint", "Ruffle is loaded once from the network. Run swfbox --fetch-ruffle for a fully offline shelf."));
  }
  side.appendChild(actions);
}

function fallback(title, message, command) {
  const box = el("div", "fallback");
  const icon = el("div", "fallback-icon");
  icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 1.6 3.9 13.9h6.2L8.7 22.4l9.8-12.9h-6.3z"></path></svg>';
  box.appendChild(icon);
  box.appendChild(el("h3", null, title));
  box.appendChild(el("p", null, message));
  if (command) box.appendChild(el("span", "cmd", command));
  return box;
}

function ensureRuffle() {
  if (!DATA.ruffle) return Promise.reject(new Error("No Ruffle build is configured."));
  if (window.RufflePlayer && typeof window.RufflePlayer.newest === "function") return Promise.resolve();
  if (rufflePromise) return rufflePromise;
  rufflePromise = new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      rufflePromise = null;
      finish(reject, new Error("Ruffle took too long to load. Check your connection, or run swfbox --fetch-ruffle."));
    }, 20000);
    const script = document.createElement("script");
    script.src = DATA.ruffle.url;
    script.async = true;
    script.onload = () => {
      if (window.RufflePlayer && typeof window.RufflePlayer.newest === "function") finish(resolve);
      else finish(reject, new Error("Ruffle loaded but did not expose its player API."));
    };
    script.onerror = () => {
      rufflePromise = null;
      finish(reject, new Error("Could not load Ruffle from " + DATA.ruffle.url));
    };
    document.head.appendChild(script);
  });
  return rufflePromise;
}

async function mount(entry, token) {
  stage.replaceChildren();
  if (entry.broken) {
    stage.appendChild(fallback("This file could not be read", entry.error || "The parser rejected this SWF.", null));
    return;
  }
  if (!DATA.ruffle) {
    stage.appendChild(fallback(
      "No Ruffle configured",
      "No Ruffle configured — run swfbox --fetch-ruffle or swfbox serve. The library itself never needs the network.",
      "swfbox --fetch-ruffle",
    ));
    return;
  }
  const loading = el("div", "stage-loading");
  loading.appendChild(el("div", "spinner"));
  loading.appendChild(el("div", null, "Loading Ruffle…"));
  stage.appendChild(loading);

  try {
    await ensureRuffle();
    if (token !== openToken || !dialog.open) return;
    const source = window.RufflePlayer && typeof window.RufflePlayer.newest === "function" ? window.RufflePlayer.newest() : null;
    if (!source) throw new Error("Ruffle did not expose a player. Try a different build.");
    const player = source.createPlayer();
    player.style.width = "100%";
    player.style.height = "100%";
    player.setAttribute("letterbox", "on");
    stage.replaceChildren(player);
    await player.ruffle().load(entry.src);
  } catch (error) {
    if (token !== openToken) return;
    stage.replaceChildren();
    const box = fallback("Ruffle could not start", error && error.message ? error.message : "Unknown playback error.", null);
    if (DATA.ruffle && DATA.ruffle.url) box.appendChild(el("span", "cmd", DATA.ruffle.url));
    const retry = el("button", "btn", "Try again");
    retry.type = "button";
    retry.addEventListener("click", () => { rufflePromise = null; mount(entry, ++openToken); });
    box.appendChild(retry);
    stage.appendChild(box);
  }
}

let openToken = 0;
function openEntry(entry) {
  currentIndex = current.indexOf(entry);
  if (currentIndex === -1) {
    current = filtered();
    currentIndex = current.indexOf(entry);
  }
  const token = ++openToken;
  document.getElementById("detail-title").textContent = entry.title;
  document.getElementById("detail-sub").textContent = entry.relativePath;
  const badges = document.getElementById("detail-badges");
  badges.replaceChildren(badge(entry.kind));
  if (entry.truncated) badges.appendChild(el("span", "badge unknown", "Truncated"));
  if (entry.metadata && hasText(entry.metadata.creator)) badges.appendChild(el("span", "badge unknown", entry.metadata.creator));
  fillSide(entry);
  updateNav();
  if (!dialog.open) dialog.showModal();
  mount(entry, token);
}

function updateNav() {
  const prev = document.getElementById("detail-prev");
  const next = document.getElementById("detail-next");
  const pos = document.getElementById("detail-pos");
  prev.disabled = currentIndex <= 0;
  next.disabled = currentIndex < 0 || currentIndex >= current.length - 1;
  pos.textContent = currentIndex >= 0 ? (currentIndex + 1) + " / " + current.length : "";
}

function step(delta) {
  const nextIndex = currentIndex + delta;
  if (nextIndex < 0 || nextIndex >= current.length) return;
  openEntry(current[nextIndex]);
}

document.getElementById("detail-prev").addEventListener("click", () => step(-1));
document.getElementById("detail-next").addEventListener("click", () => step(1));
document.getElementById("detail-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
dialog.addEventListener("close", () => {
  openToken += 1;
  stage.replaceChildren();
});
document.addEventListener("keydown", (event) => {
  const typing = /^(input|textarea|select)$/i.test(event.target.tagName) || event.target.isContentEditable;
  if (event.key === "/" && !typing) {
    event.preventDefault();
    document.getElementById("search").focus();
    return;
  }
  if (!dialog.open) return;
  if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
  if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
});
document.getElementById("search").addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.target.value = "";
    state.query = "";
    render();
  }
});

document.getElementById("theme-toggle").addEventListener("click", () => {
  const root = document.documentElement;
  const next = root.dataset.theme === "light" ? "dark" : "light";
  root.dataset.theme = next;
  try { localStorage.setItem("swfbox-theme", next); } catch {}
});

try {
  const saved = localStorage.getItem("swfbox-theme");
  if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
} catch {}

render();
renderBroken();
`;
