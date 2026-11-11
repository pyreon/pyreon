/**
 * Observatory chrome — the styled frame of the Loom UI (header, view bar,
 * panel, cards), rocketstyle on the `el`/`txt` bases, tokens from `./theme`
 * bound via `withTheme<LoomTokens>()`. The layout follows the tool-app design
 * (`Loom.html`): a 48 px top bar, a 240 px package list, a 42 px view bar over
 * the canvas, a 340 px detail rail and a 28 px status bar — dense 13 px UI,
 * mono for data.
 *
 * High-cardinality rows (package list, chips, matrix, table, graph) are NOT
 * here: they are plain elements with global classes (`global-css.ts`), where a
 * row costs nothing to create.
 *
 * House rules (learned the hard way — see anti-patterns "Element-based
 * components styled with flex overrides"):
 *  - LAYOUT is Element's own props in `.attrs()` — `contentDirection`
 *    ('inline' row / 'rows' column), `contentAlignX/Y` (AXIS-fixed: X is
 *    always horizontal), `gap` (number), `block` (full-width). Element is a
 *    flex box natively; never re-declare display/flex-direction/align in a
 *    theme. `.theme()` is VISUAL CSS only (color, padding, radius, type).
 *  - The documented special cases: `flexWrap` (no Element prop) rides in the
 *    theme on the wrapper's own flex display; CSS grid components declare
 *    their whole layout in the theme (grid is outside Element's flex model);
 *    text truncation needs `display: 'block'` (flex never ellipsizes).
 */
import { el, txt, DISPLAY, MONO, type InputEl } from './kit'

/** The design's breakpoints: scan summary + narrower rail, list drawer, panel drawer. */
export const BP = { rail: 1100, list: 860, panel: 760, tight: 560 } as const
const upTo = (w: number, css: string) => `@media (max-width: ${w}px){${css}}`

// ── frame ──────────────────────────────────────────────────────────────────
export const Shell = el
  // block — the root must FILL the viewport; Element defaults to inline-flex.
  .attrs({ tag: 'div', block: true, contentDirection: 'rows', contentAlignX: 'block' })
  .theme((t) => ({
    // 100dvh where supported: on mobile 100vh includes the collapsing URL
    // bar, which pushed the status bar off-screen.
    height: '100vh', overflow: 'hidden', fontSize: '13px', extendCss: 'height:100dvh;',
    fontFamily: DISPLAY, background: t.bg, color: t.text,
  }))
export const Body = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'block' })
  // relative: the positioning context for the drawers + scrim.
  .theme(() => ({ flex: '1', minHeight: '0', position: 'relative' }))
export const Main = el
  .attrs({ tag: 'main', contentDirection: 'rows', contentAlignX: 'block' })
  .theme(() => ({ flex: '1', minWidth: '0', minHeight: '0' }))
export const Spacer = el.attrs({ tag: 'div' }).theme(() => ({ flex: '1', minWidth: '0' }))

// ── top bar ────────────────────────────────────────────────────────────────
export const Header = el
  .attrs({ tag: 'header', contentDirection: 'inline', contentAlignY: 'center', gap: 16 })
  .theme((t) => ({
    height: '48px', flex: 'none', padding: '0 14px',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border,
    background: t.surface,
    extendCss: upTo(BP.tight, 'column-gap:8px;padding:0 10px;'),
  }))
export const Brand = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme((t) => ({ flex: 'none', color: t.text }))
export const BrandName = txt
  .attrs({ tag: 'span' })
  .theme(() => ({ fontSize: '15px', fontWeight: '600', extendCss: 'letter-spacing:-.01em;' }))
export const BrandWorkspace = txt
  .attrs({ tag: 'span' })
  .theme((t) => ({
    fontFamily: MONO, fontSize: '11px', color: t.faint, paddingLeft: '8px',
    borderWidthLeft: '1px', borderStyleLeft: 'solid', borderColorLeft: t.border,
    extendCss:
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;' +
      upTo(BP.tight, 'display:none;'),
  }))

/** The view switch — a segmented control (role=group of aria-pressed buttons, or links). */
export const ViewSeg = el
  .attrs({ tag: 'nav', contentDirection: 'inline', contentAlignY: 'center', gap: 2 })
  .theme((t) => ({
    padding: '3px', borderRadius: '7px', flex: 'none', background: t.bg,
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border,
    // Narrow: the segment shrinks and scrolls sideways rather than clipping.
    extendCss:
      upTo(BP.tight, 'flex:1 1 auto;min-width:0;overflow-x:auto;scrollbar-width:none;') +
      '&::-webkit-scrollbar{display:none;}',
  }))
export const ViewBtn = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignY: 'center' })
  .states((t) => ({
    idle: { color: t.faint, background: 'transparent', hover: { color: t.text } },
    active: { color: t.accent, background: t.accentSoft },
  }))
  .theme(() => ({
    height: '24px', padding: '0 12px', border: 'none', borderRadius: '4px', flex: 'none',
    fontFamily: MONO, fontSize: '12px',
    extendCss: 'white-space:nowrap;cursor:pointer;',
  }))

export const ScanSummary = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', gap: 14 })
  .theme((t) => ({
    flex: 'none', fontFamily: MONO, fontSize: '11.5px', color: t.faint,
    extendCss: `white-space:nowrap;${upTo(BP.rail, 'display:none;')}`,
  }))
export const ScanItem = el
  .attrs({ tag: 'span', contentDirection: 'inline', contentAlignY: 'center', gap: 6 })
  .theme(() => ({}))
export const ScanCount = txt
  .attrs({ tag: 'b' })
  .variants((t) => ({
    error: { color: t.danger },
    warning: { color: t.warn },
    info: { color: t.muted },
  }))
  .theme(() => ({ fontWeight: '500' }))

export const IconBtn = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignX: 'center', contentAlignY: 'center' })
  .theme((t) => ({
    width: '30px', height: '30px', borderRadius: '6px', flex: 'none', padding: '0',
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border,
    background: 'transparent', color: t.muted,
    extendCss: `cursor:pointer;&:hover{color:${t.text};border-color:${t.faint};}`,
  }))

// ── package list ───────────────────────────────────────────────────────────
const DRAWER = (side: 'left' | 'right', below: number) =>
  upTo(
    below,
    `position:absolute;top:0;bottom:0;${side}:0;z-index:30;width:min(88vw,320px);` +
      'box-shadow:0 16px 48px -8px rgba(0,0,0,.45);animation:lm-in .16s ease-out;',
  )

export const Sidebar = el
  // contentAlignX block: the column children STRETCH (the filter row's
  // divider spans the list).
  .attrs({ tag: 'aside', contentDirection: 'rows', contentAlignX: 'block' })
  .theme((t) => ({
    width: '240px', flex: 'none', minHeight: '0',
    borderWidthRight: '1px', borderStyleRight: 'solid', borderColorRight: t.border, background: t.bg,
    extendCss: DRAWER('left', BP.list),
  }))
export const SideHead = el
  .attrs({ tag: 'div', block: true })
  .theme((t) => ({
    padding: '10px', flex: 'none',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border,
  }))
export const FilterField = el
  .attrs({ tag: 'input' })
  .theme((t) => ({
    width: '100%', height: '30px', padding: '0 10px', borderRadius: '5px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border,
    background: t.surface, color: t.text, fontSize: '13px',
    extendCss: `font-family:inherit;&::placeholder{color:${t.faint};}`,
  })) as unknown as InputEl
export const SideList = el
  .attrs({ tag: 'div', block: true, contentDirection: 'rows', contentAlignX: 'block' })
  .theme(() => ({ flex: '1', minHeight: '0', overflowY: 'auto', padding: '6px' }))
/** Mobile-only tap-to-close layer behind an open drawer. */
export const DrawerScrim = el
  .attrs({ tag: 'button' })
  .theme(() => ({
    position: 'absolute', top: '0', left: '0', right: '0', bottom: '0', zIndex: '20', border: 'none', padding: '0',
    extendCss: 'background:rgba(8,10,16,.45);cursor:pointer;',
  }))

// ── view bar + canvas ──────────────────────────────────────────────────────
export const ViewBar = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', gap: 12 })
  .theme((t) => ({
    minHeight: '42px', flex: 'none', padding: '6px 14px',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border, background: t.bg,
    // flexWrap has no Element prop — the documented theme-level special case.
    flexWrap: 'wrap', extendCss: 'row-gap:6px;',
  }))
export const ViewTitle = txt
  .attrs({ tag: 'h1' })
  .theme(() => ({ fontSize: '14px', fontWeight: '600', margin: '0', extendCss: 'white-space:nowrap;' }))
export const ViewSub = txt
  .attrs({ tag: 'p' })
  .theme((t) => ({
    // display:block — a flex item never ellipsizes otherwise (documented case).
    display: 'block', flex: '1 1 0', minWidth: '0', margin: '0', fontSize: '12px', color: t.faint,
    extendCss: `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${upTo(BP.tight, 'display:none;')}`,
  }))
export const ChipGroup = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', gap: 6 })
  .theme(() => ({ flex: 'none', marginLeft: 'auto' }))
export const Chip = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignY: 'center', gap: 6 })
  .states((t) => ({
    off: { color: t.muted, borderColor: t.border, background: 'transparent', hover: { color: t.text } },
    on: { color: t.accent, borderColor: t.accent, background: t.accentSoft },
  }))
  .theme(() => ({
    height: '26px', padding: '0 9px', borderRadius: '5px', borderWidth: '1px', borderStyle: 'solid',
    fontFamily: MONO, fontSize: '11px', flex: 'none',
    extendCss: 'cursor:pointer;white-space:nowrap;',
  }))
/** The view bar's drawer toggles — rendered only below the breakpoint that makes a drawer. */
export const DrawerBtn = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignX: 'center', contentAlignY: 'center' })
  .theme((t) => ({
    width: '26px', height: '26px', flex: 'none', borderRadius: '5px', padding: '0',
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border,
    background: 'transparent', color: t.muted, fontFamily: MONO, fontSize: '12px',
    extendCss: `cursor:pointer;&:hover{color:${t.text};}`,
  }))
export const Canvas = el
  .attrs({ tag: 'div', block: true })
  .theme((t) => ({
    flex: '1', minHeight: '0', overflow: 'auto', position: 'relative', background: t.deep,
  }))

// ── article views (cycles / impact / manifest) ─────────────────────────────
export const Article = el
  .attrs({ tag: 'div', block: true, contentDirection: 'rows', contentAlignX: 'block', gap: 16 })
  .theme(() => ({ padding: '28px', maxWidth: '900px', extendCss: upTo(BP.panel, 'padding:16px;') }))
/** Article without the reading-width cap — the manifest table wants the room. */
export const ArticleWide = el
  .attrs({ tag: 'div', block: true, contentDirection: 'rows', contentAlignX: 'block', gap: 16 })
  .theme(() => ({ padding: '28px', extendCss: upTo(BP.panel, 'padding:16px;') }))
export const Card = el
  .attrs({ tag: 'section', block: true })
  .variants((t) => ({
    plain: { borderColor: t.border },
    error: { borderColor: t.dangerRing },
    ok: { borderColor: t.okRing },
  }))
  .theme((t) => ({
    borderWidth: '1px', borderStyle: 'solid', borderRadius: '10px', background: t.surface,
    padding: '18px', minWidth: '0',
  }))
export const CardHead = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', gap: 8, block: true })
  .theme((t) => ({ fontFamily: MONO, fontSize: '11.5px', color: t.text, marginBottom: '10px' }))
export const CardSev = txt
  .attrs({ tag: 'em' })
  .variants((t) => ({ error: { color: t.danger }, warning: { color: t.warn }, ok: { color: t.ok } }))
  .theme(() => ({
    marginLeft: 'auto', fontStyle: 'normal', fontSize: '10px', textTransform: 'uppercase',
    extendCss: 'letter-spacing:.08em;',
  }))
export const CardTitle = txt
  .attrs({ tag: 'h2' })
  .theme(() => ({ fontSize: '15px', fontWeight: '600', margin: '0 0 8px' }))
export const CardText = txt
  .attrs({ tag: 'p' })
  .theme((t) => ({
    fontSize: '13px', color: t.muted, margin: '0 0 14px',
    extendCss: 'line-height:1.6;&:last-child{margin-bottom:0;}',
  }))
export const Mono = txt.attrs({ tag: 'span' }).theme((t) => ({ fontFamily: MONO, color: t.text }))

// ── detail rail ────────────────────────────────────────────────────────────
export const Panel = el
  .attrs({ tag: 'aside', contentDirection: 'rows', contentAlignX: 'block' })
  .theme((t) => ({
    width: '340px', flex: 'none', minHeight: '0', overflowY: 'auto',
    borderWidthLeft: '1px', borderStyleLeft: 'solid', borderColorLeft: t.border, background: t.bg,
    extendCss: upTo(BP.rail, 'width:290px;') + DRAWER('right', BP.panel),
  }))
export const PanelHead = el
  .attrs({ tag: 'div', block: true })
  .theme((t) => ({
    padding: '16px', flex: 'none',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border,
  }))
export const PanelName = txt
  .attrs({ tag: 'h2' })
  .theme(() => ({
    fontFamily: MONO, fontSize: '15px', fontWeight: '500', margin: '0 0 8px',
    extendCss: 'word-break:break-all;',
  }))
export const Stats = el
  .attrs({ tag: 'div', block: true })
  .theme((t) => ({
    display: 'grid', flex: 'none',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border,
    extendCss: 'grid-template-columns:repeat(3,minmax(0,1fr));',
  }))
export const Stat = el
  .attrs({ tag: 'div', contentDirection: 'rows', gap: 2 })
  .theme((t) => ({
    padding: '12px 16px', minWidth: '0',
    borderWidthRight: '1px', borderStyleRight: 'solid', borderColorRight: t.border,
    extendCss: '&:last-child{border-right:0;}',
  }))
export const StatLabel = txt
  .attrs({ tag: 'span' })
  .theme((t) => ({
    fontFamily: MONO, fontSize: '10px', color: t.faint, textTransform: 'uppercase',
    extendCss: 'letter-spacing:.12em;',
  }))
export const StatValue = txt
  .attrs({ tag: 'span' })
  .variants((t) => ({ plain: { color: t.text }, accent: { color: t.accent } }))
  .theme(() => ({ fontFamily: MONO, fontSize: '20px' }))
export const Section = el
  .attrs({ tag: 'section', block: true })
  .theme((t) => ({
    padding: '14px 16px', flex: 'none',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border,
    extendCss: '&:last-child{border-bottom:0;}',
  }))
export const SectionHead = el
  .attrs({ tag: 'h3', contentDirection: 'inline', contentAlignX: 'spaceBetween', block: true })
  .theme((t) => ({
    fontFamily: MONO, fontSize: '10px', fontWeight: '500', color: t.faint, margin: '0 0 10px',
    textTransform: 'uppercase', extendCss: 'letter-spacing:.14em;',
  }))
export const Note = txt
  .attrs({ tag: 'p' })
  .theme((t) => ({ fontSize: '12.5px', color: t.faint, margin: '0', extendCss: 'line-height:1.5;' }))

// ── status bar ─────────────────────────────────────────────────────────────
export const StatusBar = el
  .attrs({ tag: 'footer', contentDirection: 'inline', contentAlignY: 'center', gap: 18 })
  .theme((t) => ({
    height: '28px', flex: 'none', padding: '0 14px',
    borderWidthTop: '1px', borderStyleTop: 'solid', borderColorTop: t.border,
    background: t.surface, fontFamily: MONO, fontSize: '11px', color: t.faint,
    extendCss: 'white-space:nowrap;overflow-x:auto;scrollbar-width:none;&::-webkit-scrollbar{display:none;}',
  }))

// ── ⌘K search dialog (docs-site style; shared shape with atlas) ────────────
export const SearchBackdrop = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'center' })
  .theme((t) => ({
    position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', zIndex: '80',
    fontFamily: DISPLAY, fontSize: '13px', color: t.text,
    extendCss: 'background:rgba(8,10,16,.55);backdrop-filter:blur(4px);',
  }))
export const SearchDialogCard = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'block' })
  .theme((t) => ({
    width: 'min(600px,92vw)', marginTop: '12vh', maxHeight: '60vh',
    borderRadius: '10px', overflow: 'hidden',
    background: t.surface, borderWidth: '1px', borderStyle: 'solid', borderColor: t.border,
    extendCss: 'box-shadow:0 24px 80px -16px rgba(0,0,0,.55);animation:lm-in .14s ease-out;',
  }))
export const SearchDialogHead = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme((t) => ({
    padding: '4px 14px', flex: 'none', position: 'relative',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border,
    // The focus cue lives on the head row (an accent underline), not as a
    // square outline on the borderless field that overlapped the esc hint.
    extendCss: `transition:box-shadow .12s;&:focus-within{box-shadow:inset 0 -2px 0 ${t.accent};}`,
  }))
export const SearchGlyph = txt
  .attrs({ tag: 'span' })
  .theme((t) => ({ color: t.faint, fontSize: '16px', flex: 'none', lineHeight: '1' }))
export const SearchDialogField = el
  .attrs({ tag: 'input' })
  .theme((t) => ({
    flex: '1', border: 'none', background: 'transparent', color: t.text,
    fontSize: '14px', padding: '12px 0',
    extendCss: `outline:none;font-family:inherit;&::placeholder{color:${t.faint};}`,
  })) as unknown as InputEl
export const Kbd = txt
  .attrs({ tag: 'span' })
  .theme((t) => ({
    fontFamily: MONO, fontSize: '10px', color: t.faint, flex: 'none',
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border, borderRadius: '4px',
    padding: '2px 6px',
  }))
export const SearchResults = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'block' })
  .theme(() => ({ overflowY: 'auto', padding: '6px', flex: '1' }))
export const SearchRow = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignY: 'center', gap: 12, block: true })
  .states((t) => ({
    active: { background: t.accentSoft },
    idle: { background: 'transparent', hover: { background: t.surface2 } },
  }))
  .theme((t) => ({
    // color: a <button> does not inherit text colour — without it every hit
    // name rendered in the UA's near-black, invisible on the dark card.
    font: 'inherit', cursor: 'pointer', textAlign: 'left', border: 'none', color: t.text,
    minHeight: '32px', padding: '6px 10px', borderRadius: '5px',
  }))
export const SearchRowName = txt
  .attrs({ tag: 'span' })
  .theme((t) => ({
    fontFamily: MONO, fontSize: '12px', color: t.text, minWidth: '0',
    extendCss: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;',
  }))
export const SearchRowKind = txt
  .attrs({ tag: 'span' })
  .variants((t) => ({ internal: { color: t.faint }, external: { color: t.ext } }))
  .theme(() => ({ fontFamily: MONO, fontSize: '10px', flex: '1', minWidth: '0' }))
export const SearchRowReason = txt
  .attrs({ tag: 'span' })
  .theme((t) => ({
    fontFamily: MONO, fontSize: '10px', color: t.accent, flex: 'none',
    padding: '2px 6px', borderRadius: '4px', background: t.accentSoft,
    extendCss: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px;',
  }))
export const SearchEmpty = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'center' })
  .theme((t) => ({ padding: '32px 16px', color: t.faint, fontSize: '13px', textAlign: 'center' }))
export const SearchFoot = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', gap: 12 })
  .theme((t) => ({
    padding: '8px 14px', flex: 'none',
    borderWidthTop: '1px', borderStyleTop: 'solid', borderColorTop: t.border,
    fontFamily: MONO, fontSize: '10px', color: t.faint,
    flexWrap: 'wrap',
  }))
/** Overflow note under the ⌘K results when the list is capped. */
export const SearchMore = txt
  .attrs({ tag: 'div' })
  .theme((t) => ({ fontFamily: MONO, fontSize: '10.5px', color: t.faint, padding: '8px 10px' }))
