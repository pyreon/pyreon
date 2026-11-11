/**
 * The observatory's GLOBAL stylesheet — theme custom properties, the page
 * reset, and the classes of the three high-cardinality layers that are
 * deliberately NOT rocketstyle components:
 *
 *  - the graph SVG (SVG elements cannot be Element-based components at all),
 *  - the adjacency matrix (up to n² cells),
 *  - the manifest table (one row per node, 300+ on a real monorepo).
 *
 * A rocketstyle component costs a theme resolution + a class per INSTANCE;
 * at 23k matrix cells that was a 2.5-3.9 s main-thread freeze on every
 * selection change. Plain elements with static classes cost nothing to
 * create, and — the part that matters for interaction — their selection /
 * hover highlighting is driven by ONE per-view `<style>` whose text changes,
 * so a selection change mutates one text node instead of O(n²) elements.
 *
 * Colours reach these classes as `--lm-*` custom properties, defined here
 * for both modes and switched by `data-lm-theme` on the shell (and on
 * `<html>`, so the page background follows too). SVG presentation
 * ATTRIBUTES cannot read `var()`, which is why every paint lives in CSS.
 *
 * Specificity note: this sheet is UNLAYERED while rocketstyle's rules live in
 * `@layer`s, and an unlayered declaration beats a layered one regardless of
 * specificity. So nothing here may set a property a rocketstyle component
 * also sets (e.g. `a{color:inherit}` would override every ViewBtn state).
 */
import { sheet } from '@pyreon/styler'
import { cssVars, tokens } from './theme'

const DARK = cssVars(tokens(true))
const LIGHT = cssVars(tokens(false))
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace"

export const GLOBAL_CSS = `
:root,[data-lm-theme=dark]{${DARK}color-scheme:dark}
@media (prefers-color-scheme: light){:root:not([data-lm-theme=dark]){${LIGHT}color-scheme:light}}
[data-lm-theme=light]{${LIGHT}color-scheme:light}
@keyframes lm-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
*{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{background:var(--lm-bg);color:var(--lm-text);-webkit-font-smoothing:antialiased}
[data-lm-theme] a{text-decoration:none}
:where(button,a,input,[tabindex]):focus-visible{outline:2px solid var(--lm-accent);outline-offset:2px}
[data-lm-noring]:focus-visible{outline:none}
.lm-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-corner{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(120,128,150,.3);border-radius:20px;border:3px solid transparent;background-clip:content-box}

/* ── shared glyphs: severity is SHAPE + colour, never colour alone ──── */
.lm-sev{display:inline-block;width:8px;height:8px;flex:none}
.lm-sev--error{background:var(--lm-danger);clip-path:polygon(50% 0,100% 100%,0 100%)}
.lm-sev--warning{background:var(--lm-warn);transform:rotate(45deg) scale(.8)}
.lm-sev--info{border-radius:50%;border:1.5px solid var(--lm-faint)}
.lm-sev--none{visibility:hidden}
.lm-sev--ok{border-radius:50%;background:var(--lm-ok)}

.lm-tag{display:inline-flex;align-items:center;gap:6px;font-family:${MONO};font-size:11px;padding:3px 8px;border-radius:4px;border:1px solid var(--lm-border);color:var(--lm-muted);white-space:nowrap}
.lm-tag--ok{color:var(--lm-ok);border-color:var(--lm-okRing)}
.lm-tag--warn{color:var(--lm-warn);border-color:var(--lm-warnRing)}
.lm-tag--danger{color:var(--lm-danger);border-color:var(--lm-dangerRing)}
.lm-tag--ext{color:var(--lm-ext)}
.lm-tags{display:flex;gap:6px;flex-wrap:wrap}

/* ── package list (one row per package, 300+ on a real monorepo) ────── */
.lm-pk-g{font-family:${MONO};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--lm-faint);padding:10px 8px 4px;display:flex;justify-content:space-between;gap:8px}
.lm-pk{display:flex;align-items:center;gap:8px;width:100%;min-height:28px;padding:4px 8px;border:0;background:transparent;border-radius:5px;font-family:${MONO};font-size:12px;color:var(--lm-muted);cursor:pointer;text-align:left}
.lm-pk:hover{background:var(--lm-surface);color:var(--lm-text)}
.lm-pk[aria-current=true]{background:var(--lm-accentSoft);color:var(--lm-text);box-shadow:inset 2px 0 0 var(--lm-accent)}
.lm-pk>span.lm-pk-n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lm-pk-d{font-size:10.5px;color:var(--lm-faint);flex:none}
.lm-pk-empty{padding:32px 12px;text-align:center;font-family:${MONO};font-size:12px;color:var(--lm-faint);line-height:1.5}

/* ── chips (deps, blast radius) and findings ──────────────────────────── */
.lm-chips{display:flex;flex-wrap:wrap;gap:6px}
.lm-chip{font-family:${MONO};font-size:11px;padding:4px 8px;border:1px solid var(--lm-border);border-radius:4px;background:var(--lm-surface);color:var(--lm-muted);cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lm-chip:hover{color:var(--lm-text);border-color:var(--lm-faint)}
.lm-chip--ext{color:var(--lm-ext)}
.lm-chip--cyc{border-color:var(--lm-dangerRing);color:var(--lm-text)}
.lm-ring{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-family:${MONO};font-size:12px;margin:12px 0}
.lm-ring i{color:var(--lm-danger);font-style:normal}
.lm-fd{border:1px solid var(--lm-border);border-radius:8px;padding:10px 12px;margin-bottom:8px}
.lm-fd:last-child{margin-bottom:0}
.lm-fd--error{border-color:var(--lm-dangerRing)}
.lm-fd--warning{border-color:var(--lm-warnRing)}
.lm-fh{display:flex;gap:8px;align-items:center;font-family:${MONO};font-size:11.5px;color:var(--lm-text);margin-bottom:6px}
.lm-fh em{font-style:normal;margin-left:auto;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--lm-faint)}
.lm-fd--error em{color:var(--lm-danger)}
.lm-fd--warning em{color:var(--lm-warn)}
.lm-fd p{margin:0;font-size:12.5px;color:var(--lm-muted);line-height:1.5;overflow-wrap:anywhere}
.lm-more{font-family:${MONO};font-size:11px;color:var(--lm-faint);margin-top:8px}

/* ── code blocks (suppress snippet, report excerpt, resolution path) ─── */
.lm-code{background:var(--lm-deep);border:1px solid var(--lm-border);border-radius:8px;overflow:hidden;min-width:0}
.lm-code-head{display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--lm-border);font-family:${MONO};font-size:11.5px;color:var(--lm-faint)}
.lm-code-head>.lm-sp{flex:1}
.lm-code-head>span{white-space:nowrap}
@media (max-width: 760px){.lm-code-head .lm-col-opt{display:none}}
.lm-code pre{margin:0;padding:12px 14px;font-family:${MONO};font-size:11.5px;line-height:1.7;color:var(--lm-text);overflow-x:auto;white-space:pre}
.lm-code .s{color:var(--lm-warn)}.lm-code .n{color:var(--lm-accent)}.lm-code .c{color:var(--lm-faint);font-style:italic}
.lm-dl{font-family:${MONO};font-size:11px;color:var(--lm-accent);border:1px solid var(--lm-border);border-radius:4px;padding:3px 8px;background:transparent;cursor:pointer}
.lm-dl:hover{border-color:var(--lm-accent)}

/* ── graph (SVG; every paint in CSS because presentation attributes
   cannot read var()). No opacity transitions: a hover changes ~1,000
   elements at once, and SVG opacity animates on the main thread. ─────── */
.lm-svg{display:block}
.lm-gpad{padding:16px 16px 72px;min-height:100%}
.lm-gedge{fill:none;stroke:var(--lm-edge);stroke-width:1.2;opacity:var(--lm-edgeAlpha);pointer-events:none}
.lm-g[data-cyc=on] .lm-gedge.lm-ce{stroke:var(--lm-danger);stroke-width:1.8;stroke-dasharray:4 4;opacity:.9}
.lm-gdev{fill:none;stroke:var(--lm-ext);stroke-width:1;stroke-dasharray:2 3;opacity:.45;pointer-events:none}
.lm-g[data-dev=off] .lm-gdevs{display:none}
.lm-gnode{cursor:pointer}
.lm-gnode:focus{outline:none}
.lm-gnode:focus-visible .lm-gbox{stroke:var(--lm-accent);stroke-width:2}
.lm-gbox{fill:var(--lm-surface);stroke:var(--lm-border);stroke-width:1}
.lm-gnode:hover .lm-gbox{stroke:var(--lm-faint)}
.lm-gsev--error{fill:var(--lm-danger)}
.lm-gsev--warning{fill:var(--lm-warn)}
.lm-gsev--info{fill:none;stroke:var(--lm-faint);stroke-width:1.2}
.lm-glabel{font-family:${MONO};font-size:11.5px;fill:var(--lm-muted);pointer-events:none}
.lm-gpriv{font-family:${MONO};font-size:9px;fill:var(--lm-faint);pointer-events:none}
.lm-gaxis{font-family:${MONO};font-size:10px;letter-spacing:.14em;fill:var(--lm-faint)}
.lm-legend{position:sticky;left:14px;bottom:14px;margin-top:-56px;width:max-content;max-width:calc(100% - 28px);display:flex;gap:14px;flex-wrap:wrap;font-family:${MONO};font-size:10.5px;color:var(--lm-faint);background:var(--lm-surface);border:1px solid var(--lm-border);border-radius:6px;padding:8px 10px;z-index:2}
.lm-legend span{display:inline-flex;gap:6px;align-items:center}
.lm-legend i{display:inline-block;width:18px;height:0;border-top:2px solid}
.lm-legend i.lm-lg-blast{border-color:var(--lm-accent)}
.lm-legend i.lm-lg-cyc{border-color:var(--lm-danger);border-top-style:dashed}
.lm-legend i.lm-lg-edge{border-color:var(--lm-edge)}
.lm-legend i.lm-lg-dev{border-color:var(--lm-ext);border-top-style:dotted}

/* ── import matrix (DSM): only edge cells exist, placed by grid-area ── */
.lm-mxwrap{padding:16px;display:inline-block;min-width:100%}
.lm-mxnote{font-family:${MONO};font-size:10.5px;color:var(--lm-faint);margin-bottom:8px;position:sticky;left:16px;max-width:calc(100vw - 48px)}
.lm-mx{display:grid;grid-template-columns:128px repeat(var(--lm-n),16px);grid-template-rows:104px repeat(var(--lm-n),16px);position:relative}
.lm-mx-corner{grid-area:1/1;position:sticky;left:0;top:0;z-index:4;background:var(--lm-deep)}
.lm-mx-ch{grid-row:1;position:sticky;top:0;z-index:3;background:var(--lm-deep);display:flex;align-items:flex-end;justify-content:center;overflow:hidden;padding-bottom:6px;border-bottom:1px solid var(--lm-border)}
.lm-mx-ch>span{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;font-family:${MONO};font-size:9px;color:var(--lm-faint);overflow:hidden;text-overflow:ellipsis;max-height:92px}
.lm-mx-rl{grid-column:1;position:sticky;left:0;z-index:2;background:var(--lm-deep);font-family:${MONO};font-size:10px;color:var(--lm-muted);text-align:right;padding:0 8px 0 0;border:0;border-right:1px solid var(--lm-border);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;height:16px;line-height:16px}
.lm-mx-rl:hover{color:var(--lm-text)}
.lm-mx-c{width:16px;height:16px;padding:0;border:0;background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:1}
.lm-mx-c::before{content:'';width:12px;height:12px;border-radius:3px;background:var(--lm-accent);opacity:.5}
.lm-mx-c:hover::before{opacity:1}
.lm-mx[data-cyc=on] .lm-back::before{background:var(--lm-danger)}
.lm-mx-d{width:16px;height:16px;display:flex;align-items:center;justify-content:center}
.lm-mx-d::before{content:'';width:4px;height:4px;border-radius:50%;background:var(--lm-border)}
.lm-mx-band{display:none;background:var(--lm-accentSoft);pointer-events:none}

/* ── version matrix: rows = externals, columns = declaring packages.
   Only DECLARED cells exist (placed by grid-area); the empty-cell dot and
   hairlines are one background, so 200 × 150 costs ~1,500 elements. ──── */
.lm-vm{display:grid;grid-template-columns:200px repeat(var(--lm-n),88px);grid-template-rows:132px repeat(var(--lm-r),30px);font-family:${MONO};font-size:11.5px;position:relative;width:max-content;background-image:radial-gradient(circle at 44px 15px,var(--lm-faint) 1px,transparent 1.5px),linear-gradient(to right,var(--lm-border) 1px,transparent 1px),linear-gradient(to bottom,var(--lm-border) 1px,transparent 1px);background-size:88px 30px;background-position:200px 132px;background-repeat:repeat;background-origin:border-box}
.lm-vm-corner{grid-area:1/1;position:sticky;left:0;top:0;z-index:4;background:var(--lm-deep);display:flex;align-items:flex-end;padding:0 12px 8px;color:var(--lm-faint);border-bottom:1px solid var(--lm-border);border-right:1px solid var(--lm-border)}
.lm-vm-ch{grid-row:1;position:sticky;top:0;z-index:3;background:var(--lm-deep);display:flex;align-items:flex-end;justify-content:center;padding-bottom:8px;border-bottom:1px solid var(--lm-border);overflow:hidden}
.lm-vm-ch>button{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;font:inherit;font-size:11px;color:var(--lm-faint);background:none;border:0;padding:0;cursor:pointer;overflow:hidden;text-overflow:ellipsis;max-height:120px}
.lm-vm-ch>button:hover{color:var(--lm-text)}
.lm-vm-rl{grid-column:1;position:sticky;left:0;z-index:2;background:var(--lm-deep);display:flex;align-items:center;gap:6px;padding:0 12px;box-shadow:inset 0 1px 0 var(--lm-border),inset -1px 0 0 var(--lm-border);min-width:0}
.lm-vm-rl>button{font:inherit;color:var(--lm-text);background:none;border:0;padding:0;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;text-align:left}
.lm-vm-rl>small{color:var(--lm-faint);font-size:10px;flex:none}
.lm-vm-c{display:flex;align-items:center;justify-content:center;padding:0 6px;color:var(--lm-muted);background:var(--lm-deep);box-shadow:inset 1px 1px 0 var(--lm-border);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;font-size:11px}
.lm-vm-c--error{background:var(--lm-dangerSoft);color:var(--lm-danger)}
.lm-vm-c--warning{background:var(--lm-warnSoft);color:var(--lm-warn)}
.lm-vm-band{display:none;background:var(--lm-accentSoft);pointer-events:none;z-index:1}

/* ── ranked table (impact) + manifest table: dense 32 px rows ────────── */
.lm-tbl{width:100%;border-collapse:separate;border-spacing:0;font-family:${MONO};font-size:12px;background:var(--lm-surface);border:1px solid var(--lm-border);border-radius:10px;table-layout:fixed}
.lm-tbl th{position:sticky;top:0;z-index:1;background:var(--lm-surface);text-align:left;font-size:10px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:var(--lm-faint);padding:8px 12px;border-bottom:1px solid var(--lm-border);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lm-tbl th:first-child{border-top-left-radius:10px}
.lm-tbl th:last-child{border-top-right-radius:10px}
.lm-tbl td{height:32px;padding:0 12px;border-bottom:1px solid var(--lm-border);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--lm-muted)}
.lm-tbl tr:last-child td{border-bottom:0}
.lm-tr{cursor:pointer;position:relative}
.lm-tr:hover td{background:var(--lm-surface2)}
.lm-tr.is-sel td{background:var(--lm-accentSoft)}
.lm-tname{display:flex;align-items:center;gap:8px;min-width:0;width:100%;border:0;background:transparent;padding:0;font:inherit;color:var(--lm-text);text-align:left;cursor:pointer}
.lm-tname::after{content:'';position:absolute;inset:0}
.lm-tname>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.lm-num{text-align:right}
.lm-bar{display:block;height:6px;border-radius:3px;background:var(--lm-surface2);overflow:hidden}
.lm-bar>i{display:block;height:100%;background:var(--lm-accent);border-radius:3px}
.lm-bar>i.is-cyc{background:var(--lm-danger)}
.lm-warnc{color:var(--lm-warn)}
.lm-dangerc{color:var(--lm-danger)}
.lm-th-name{width:40%}.lm-th-ver{width:18%}.lm-th-find{width:17%}.lm-th-lic{width:12%}.lm-th-status{width:13%}
.lm-th-rank{width:48px}.lm-th-bar{width:28%}.lm-th-n{width:96px}
@media (max-width: 760px){.lm-tbl .lm-col-opt{display:none}.lm-th-name{width:52%}.lm-th-ver{width:22%}.lm-th-status{width:26%}.lm-tbl td,.lm-tbl th{padding-left:8px;padding-right:8px}}

/* ── scan error (a manifest mid-edit that no longer parses) ──────────── */
.lm-err{min-height:100vh;display:grid;place-items:center;padding:16px;font-family:'Space Grotesk',system-ui,sans-serif;font-size:13px;color:var(--lm-text);background:var(--lm-deep)}
.lm-err>section{width:min(640px,100%);border:1px solid var(--lm-dangerRing);border-radius:10px;background:var(--lm-surface);padding:18px;display:grid;gap:12px}
.lm-err h1{margin:0;font-size:15px;font-weight:600}
.lm-err p{margin:0;color:var(--lm-muted);line-height:1.6}
.lm-err pre{margin:0;padding:12px 14px;border-radius:8px;border:1px solid var(--lm-border);background:var(--lm-deep);font-family:${MONO};font-size:12px;line-height:1.6;color:var(--lm-danger);white-space:pre-wrap;overflow-wrap:anywhere}
.lm-err button{justify-self:start;height:28px;padding:0 12px;border-radius:5px;border:1px solid var(--lm-border);background:transparent;color:var(--lm-text);font:inherit;cursor:pointer}
`

/**
 * Insert the global sheet. Called from `<Observatory>`'s setup rather than a
 * host entry, so EVERY host gets it — the static `loom build` site used to
 * render with no reset, no keyframes and no graph label styles because only
 * `mountObservatory` injected them. `insertGlobal` dedupes on the client and
 * re-collects per SSR render, so calling it per mount is correct for both.
 */
export function ensureGlobalStyles(): void {
  sheet.insertGlobal(GLOBAL_CSS)
}
