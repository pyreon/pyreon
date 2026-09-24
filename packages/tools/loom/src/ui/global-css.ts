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
 * also sets (e.g. `a{color:inherit}` would override every NavTab state).
 */
import { sheet } from '@pyreon/styler'
import { cssVars, tokens } from './theme'

const DARK = cssVars(tokens(true))
const LIGHT = cssVars(tokens(false))
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace"

export const GLOBAL_CSS = `
:root{${LIGHT}color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-lm-theme=light]){${DARK}color-scheme:dark}}
[data-lm-theme=dark]{${DARK}color-scheme:dark}
[data-lm-theme=light]{${LIGHT}color-scheme:light}
@keyframes lm-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes lm-dash{to{stroke-dashoffset:-16}}
@keyframes lm-pulse{0%,100%{opacity:.35}50%{opacity:.9}}
*{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{background:var(--lm-bg);color:var(--lm-text);-webkit-font-smoothing:antialiased}
[data-lm-theme] a{text-decoration:none}
:where(button,a,input,[tabindex]):focus-visible{outline:2px solid var(--lm-accent);outline-offset:2px}
[data-lm-noring]:focus-visible{outline:none}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-corner{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(120,128,150,.3);border-radius:20px;border:3px solid transparent;background-clip:content-box}

/* No opacity transitions on graph nodes/edges: a hover changes ~1,000 of
   them at once, and SVG opacity animates on the main thread — measured at
   140 ms/hover with a .12s fade vs one frame without. */
.lm-svg{display:block}
.lm-gpad{padding:16px}
.lm-gedge{fill:none;stroke:var(--lm-edge);stroke-width:1;opacity:var(--lm-edgeAlpha);pointer-events:none}
.lm-g[data-cyc=on] .lm-gedge.lm-ce{stroke:var(--lm-danger);stroke-width:1.8;stroke-dasharray:5 4;opacity:.85;animation:lm-dash 1.1s linear infinite}
.lm-gnode{cursor:pointer;scroll-margin:64px}
.lm-ghit{fill:transparent}
.lm-gdot{stroke-width:2;transition:transform .12s}
.lm-ki .lm-gdot{fill:var(--lm-accent);stroke:var(--lm-accent)}
.lm-ke .lm-gdot{fill:var(--lm-surface);stroke:var(--lm-ext)}
.lm-g[data-cyc=on] .lm-cn .lm-gdot{fill:var(--lm-danger);stroke:var(--lm-danger)}
.lm-gring{fill:none;stroke-width:1.2;opacity:.55;display:none;stroke:var(--lm-accent)}
.lm-ke .lm-gring{stroke:var(--lm-ext)}
.lm-g[data-cyc=on] .lm-cn .lm-gring{stroke:var(--lm-danger)}
.lm-glabel{font-family:${MONO};font-size:12.5px;font-weight:500;pointer-events:none;paint-order:stroke;stroke-width:3.5px;fill:var(--lm-muted);stroke:var(--lm-bg)}
.lm-gsub{font-family:${MONO};font-size:9.5px;pointer-events:none;paint-order:stroke;stroke-width:3px;fill:var(--lm-faint);stroke:var(--lm-bg);display:none}
.lm-gaxis{font-family:${MONO};font-size:9.5px;letter-spacing:.1em;fill:var(--lm-muted)}

.lm-mxwrap{padding:16px;display:inline-block;min-width:100%}
.lm-mxnote{font-family:${MONO};font-size:10.5px;color:var(--lm-faint);margin-bottom:8px;position:sticky;left:16px;width:max-content}
.lm-mx{display:grid;grid-template-columns:128px repeat(var(--lm-n),16px);grid-template-rows:104px repeat(var(--lm-n),16px);position:relative}
.lm-mx-corner{grid-area:1/1;position:sticky;left:0;top:0;z-index:4;background:var(--lm-bg)}
.lm-mx-ch{grid-row:1;position:sticky;top:0;z-index:3;background:var(--lm-bg);display:flex;align-items:flex-end;justify-content:center;overflow:hidden;padding-bottom:6px;border-bottom:1px solid var(--lm-border)}
.lm-mx-ch>span{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;font-family:${MONO};font-size:9px;color:var(--lm-faint);overflow:hidden;text-overflow:ellipsis;max-height:92px}
.lm-mx-rl{grid-column:1;position:sticky;left:0;z-index:2;background:var(--lm-bg);font-family:${MONO};font-size:10px;color:var(--lm-muted);text-align:right;padding:0 8px 0 0;border:0;border-right:1px solid var(--lm-border);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;height:16px;line-height:16px}
.lm-mx-rl:hover{color:var(--lm-text)}
.lm-mx-c{width:16px;height:16px;padding:0;border:0;background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:1}
.lm-mx-c::before{content:'';width:12px;height:12px;border-radius:4px;background:var(--lm-accent);opacity:.5;transition:opacity .15s,transform .15s}
.lm-mx-c:hover::before{opacity:1;transform:scale(1.15)}
.lm-mx[data-cyc=on] .lm-back::before{background:var(--lm-danger)}
.lm-mx-d{width:16px;height:16px;display:flex;align-items:center;justify-content:center}
.lm-mx-d::before{content:'';width:4px;height:4px;border-radius:50%;background:var(--lm-border)}
.lm-mx-band{display:none;background:var(--lm-accentSoft);pointer-events:none}
.lm-mx-empty{padding:32px;font-family:${MONO};font-size:12px;color:var(--lm-faint)}

.lm-tbl{width:100%;border-collapse:separate;border-spacing:0;font-family:${MONO};font-size:12px;background:var(--lm-surface);border:1px solid var(--lm-border);border-radius:12px;table-layout:fixed}
.lm-tbl th{position:sticky;top:0;z-index:1;background:var(--lm-surface2);text-align:left;font-size:9.5px;font-weight:500;letter-spacing:.1em;color:var(--lm-faint);padding:12px 16px;border-bottom:1px solid var(--lm-border)}
.lm-tbl th:first-child{border-top-left-radius:12px}
.lm-tbl th:last-child{border-top-right-radius:12px}
.lm-tbl td{padding:10px 16px;border-bottom:1px solid var(--lm-border);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--lm-muted)}
.lm-tbl tr:last-child td{border-bottom:0}
.lm-tr{cursor:pointer;transition:background .1s;position:relative}
.lm-tr:hover td{background:var(--lm-surface2)}
.lm-tr.is-sel td{background:var(--lm-accentSoft)}
.lm-tname{display:flex;align-items:center;gap:8px;min-width:0;width:100%;border:0;background:transparent;padding:0;font:inherit;color:var(--lm-text);text-align:left;cursor:pointer}
.lm-tr.is-sel .lm-tname{color:var(--lm-accent)}
.lm-tname::after{content:'';position:absolute;inset:0}
.lm-tname>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.lm-kdot{width:6px;height:6px;border-radius:2px;flex:none;background:var(--lm-accent)}
.lm-kdot--external{background:var(--lm-ext)}
.lm-warnc{color:var(--lm-warn)}
.lm-badge{display:inline-block;font-size:10.5px;padding:2px 8px;border-radius:4px;border:1px solid}
.lm-badge--ok{color:var(--lm-ok);border-color:var(--lm-okRing);background:var(--lm-okSoft)}
.lm-badge--warn{color:var(--lm-warn);border-color:var(--lm-warnRing);background:var(--lm-warnSoft)}
.lm-badge--danger{color:var(--lm-danger);border-color:var(--lm-dangerRing);background:var(--lm-dangerSoft)}
.lm-tbl th{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lm-th-name{width:40%}.lm-th-ver{width:18%}.lm-th-find{width:17%}.lm-th-lic{width:12%}.lm-th-status{width:13%}
@media (max-width: 760px){.lm-tbl .lm-col-opt{display:none}.lm-th-name{width:52%}.lm-th-ver{width:22%}.lm-th-status{width:26%}.lm-tbl td,.lm-tbl th{padding-left:12px;padding-right:12px}}
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
