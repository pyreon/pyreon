/**
 * Observatory chrome — every styled component of the Loom UI, rocketstyle on
 * the `el`/`txt` bases, tokens from `./theme` via the local `T` alias.
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
 *  - Spacing sits on the 4/8px grid (2px micro allowed); radii on the fixed
 *    scale: chip 4 · control 8 · card 12 · pill 20 · round.
 */
import { dim, el, txt, DISPLAY, MONO, type InputEl, type T } from './kit'

// ── frame ──────────────────────────────────────────────────────────────────
export const Shell = el
  // block — the root must FILL the viewport; Element defaults to inline-flex.
  .attrs({ tag: 'div', block: true, contentDirection: 'rows', contentAlignX: 'block' })
  .theme((t: T) => ({
    height: '100vh', overflow: 'hidden', fontSize: '14px',
    fontFamily: "'Public Sans',system-ui,sans-serif",
    background: t.bg, color: t.text,
  }))
export const Body = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'block' })
  .theme(() => ({ flex: '1', minHeight: '0' }))
export const Main = el
  .attrs({ tag: 'main', contentDirection: 'rows', contentAlignX: 'block' })
  .theme(() => ({ flex: '1', minWidth: '0', minHeight: '0' }))
export const Row = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center' })
  .theme(() => ({}))
export const Col = el.attrs({ tag: 'div', contentDirection: 'rows' }).theme(() => ({ lineHeight: '1.2' }))
export const Spacer = el.attrs({ tag: 'div' }).theme(() => ({ flex: '1', minWidth: '8px' }))

// ── header ─────────────────────────────────────────────────────────────────
export const Header = el
  .attrs({ tag: 'header', contentDirection: 'inline', contentAlignY: 'center', gap: 16 })
  .theme((t: T) => ({
    height: '56px', flex: 'none', padding: '0 16px',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border,
    background: t.surface,
  }))
export const BrandBlock = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', gap: 12 })
  .theme(() => ({ flex: 'none' }))
export const BrandMark = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignX: 'center', contentAlignY: 'center' })
  .theme((t: T) => ({
    width: '32px', height: '32px', borderRadius: '8px', background: t.accent,
    extendCss: `box-shadow:0 4px 14px ${t.accentSoft};`,
  }))
export const BrandGlyph = txt
  .attrs({ tag: 'span' })
  .theme(() => ({ fontFamily: MONO, fontSize: '13px', fontWeight: '700', color: '#0f0f14' }))
export const BrandName = txt
  .attrs({ tag: 'span' })
  .theme(() => ({ fontFamily: DISPLAY, fontWeight: '700', fontSize: '16px', extendCss: 'letter-spacing:-.01em;' }))
export const BrandSub = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({ fontFamily: MONO, fontSize: '9.5px', color: t.faint, extendCss: 'letter-spacing:.08em;' }))

export const NavTabs = el
  .attrs({ tag: 'nav', contentDirection: 'inline', gap: 4 })
  .theme((t: T) => ({ background: t.surface2, padding: '4px', borderRadius: '12px', flex: 'none' }))
export const NavTab = el
  .attrs({ tag: 'button' })
  .states(dim((t) => ({
    idle: { color: t.muted, background: 'transparent', hover: { color: t.text } },
    active: { color: t.text, background: t.surface, extendCss: 'box-shadow:0 1px 3px rgba(0,0,0,.25);' },
  })))
  .theme(() => ({
    fontSize: '12.5px', fontWeight: '600', border: 'none', padding: '8px 12px',
    borderRadius: '8px', extendCss: 'white-space:nowrap;cursor:pointer;transition:all .12s;font-family:inherit;',
  }))

export const SearchWrap = el
  .attrs({ tag: 'div' })
  .theme(() => ({ position: 'relative', width: '100%', maxWidth: '400px', extendCss: 'margin:0 auto;' }))
export const SearchGlyph = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    position: 'absolute', color: t.faint, fontSize: '13px',
    extendCss: 'left:12px;top:50%;transform:translateY(-50%);',
  }))
export const SearchInput = el
  .attrs({ tag: 'input' })
  .theme((t: T) => ({
    fontSize: '13px', width: '100%', padding: '8px 48px 8px 32px', borderRadius: '8px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border,
    background: t.bg, color: t.text,
    extendCss: `outline:none;font-family:inherit;transition:border-color .12s,box-shadow .12s;&:focus{border-color:${t.accent};box-shadow:0 0 0 3px ${t.accentSoft};}`,
  })) as unknown as InputEl
export const SearchKbd = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    position: 'absolute', fontFamily: MONO, fontSize: '10px', color: t.faint,
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border, borderRadius: '4px',
    padding: '2px 8px', extendCss: 'right:12px;top:50%;transform:translateY(-50%);',
  }))

export const HealthPill = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .states(dim((t) => ({
    ok: { borderColor: t.okRing, background: t.okSoft },
    bad: { borderColor: t.dangerRing, background: t.dangerSoft },
  })))
  .theme(() => ({
    padding: '4px 12px', borderRadius: '20px', borderWidth: '1px', borderStyle: 'solid', flex: 'none',
  }))
export const HealthDot = el
  .attrs({ tag: 'span' })
  .states(dim((t) => ({ ok: { background: t.ok }, bad: { background: t.danger } })))
  .theme(() => ({ width: '8px', height: '8px', borderRadius: '50%', flex: 'none', extendCss: 'animation:lm-pulse 2.4s infinite;' }))
export const HealthText = txt
  .attrs({ tag: 'span' })
  .states(dim((t) => ({ ok: { color: t.ok }, bad: { color: t.danger } })))
  .theme(() => ({ fontFamily: MONO, fontSize: '10.5px' }))

export const IconBtn = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignX: 'center', contentAlignY: 'center' })
  .theme((t: T) => ({
    width: '32px', height: '32px', borderRadius: '8px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border,
    background: t.bg, color: t.text, fontSize: '15px',
    extendCss: `cursor:pointer;font-family:inherit;&:hover{border-color:${t.accent};}`,
  }))

// ── sidebar ────────────────────────────────────────────────────────────────
export const Sidebar = el
  .attrs({ tag: 'aside', contentDirection: 'rows' })
  .theme((t: T) => ({
    width: 'clamp(200px,20vw,268px)', flex: 'none', minHeight: '0',
    borderWidthRight: '1px', borderStyleRight: 'solid', borderColorRight: t.border, background: t.surface,
  }))
export const KindRow = el
  .attrs({ tag: 'div', contentDirection: 'inline', gap: 4 })
  .theme((t: T) => ({
    padding: '12px 16px',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border,
  }))
export const KindBtn = el
  .attrs({ tag: 'button' })
  .states(dim((t) => ({
    idle: { borderColor: t.border, color: t.muted, background: 'transparent' },
    active: { borderColor: t.accent, color: '#0f0f14', background: t.accent },
  })))
  .theme(() => ({
    fontSize: '11.5px', fontWeight: '600', flex: '1', padding: '8px 4px', borderRadius: '8px',
    borderWidth: '1px', borderStyle: 'solid',
    extendCss: 'cursor:pointer;transition:all .12s;font-family:inherit;text-align:center;',
  }))
export const SideList = el
  .attrs({ tag: 'div' })
  .theme(() => ({ flex: '1', overflowY: 'auto', padding: '0 8px 16px' }))
export const GroupHead = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme((t: T) => ({
    margin: '16px 0 4px', padding: '0 8px', fontSize: '11px', fontWeight: '700', color: t.muted,
  }))
export const GroupNum = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: MONO, fontSize: '10px', color: t.accent }))
export const GroupGlyph = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: MONO, fontSize: '10px', color: t.faint }))
export const GroupLabel = txt.attrs({ tag: 'span' }).theme(() => ({ flex: '1' }))
export const GroupCount = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: MONO, fontSize: '10px', color: t.faint }))

export const PkgBtn = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignY: 'center', gap: 8, block: true })
  .states(dim((t) => ({
    idle: { color: t.text, background: 'transparent', hover: { background: t.surface2 } },
    active: { color: t.accent, background: t.accentSoft, hover: { background: t.accentSoft } },
  })))
  .theme(() => ({
    textAlign: 'left', border: 'none', padding: '8px', borderRadius: '8px', marginBottom: '2px',
    extendCss: 'cursor:pointer;transition:background .1s;font-family:inherit;',
  }))
export const PkgBar = el
  .attrs({ tag: 'span' })
  .states(dim((t) => ({ idle: { background: 'transparent' }, active: { background: t.accent } })))
  .theme(() => ({ width: '3px', height: '16px', borderRadius: '2px', flex: 'none' }))
export const PkgName = txt
  .attrs({ tag: 'span' })
  .theme(() => ({
    flex: '1', minWidth: '0', fontSize: '12.5px', fontFamily: MONO,
    extendCss: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
  }))
export const PkgFlag = el
  .attrs({ tag: 'span' })
  .variants(dim((t) => ({
    danger: { background: t.danger },
    warn: { background: t.warn },
  })))
  .theme(() => ({ width: '6px', height: '6px', borderRadius: '50%', flex: 'none' }))
export const SideEmpty = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({ textAlign: 'center', padding: '44px 16px', color: t.faint, fontFamily: MONO, fontSize: '12px', extendCss: 'line-height:1.5;' }))
export const SideFoot = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    borderWidthTop: '1px', borderStyleTop: 'solid', borderColorTop: t.border,
    padding: '12px 16px', fontFamily: MONO, fontSize: '10.5px', color: t.muted,
  }))

// ── main toolbar + canvas ──────────────────────────────────────────────────
export const ViewBar = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center' })
  .theme((t: T) => ({
    // flexWrap + a two-axis gap have no Element prop — the documented
    // theme-level special case, riding on the wrapper's own flex display.
    flexWrap: 'wrap', gap: '8px 16px',
    flex: 'none', padding: '12px 16px',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border, background: t.surface,
  }))
/** Title + eyebrow stack in the ViewBar — real gap so the two never collide. */
export const ViewTitleBlock = el
  .attrs({ tag: 'div', contentDirection: 'rows', gap: 2 })
  .theme(() => ({ lineHeight: '1.3' }))
export const ViewTitle = txt
  .attrs({ tag: 'span' })
  .theme(() => ({ fontFamily: DISPLAY, fontWeight: '600', fontSize: '15px', extendCss: 'white-space:nowrap;' }))
export const ViewEyebrow = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    fontFamily: MONO, fontSize: '10px', color: t.faint,
    extendCss: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.06em;',
  }))
export const CyclesBtn = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .states(dim((t) => ({
    on: { borderColor: t.dangerRing, background: t.dangerSoft, color: t.danger },
    off: { borderColor: t.border, background: 'transparent', color: t.muted },
  })))
  .theme(() => ({
    fontSize: '12px', padding: '8px 12px', borderRadius: '8px',
    borderWidth: '1px', borderStyle: 'solid',
    extendCss: 'cursor:pointer;white-space:nowrap;transition:all .12s;font-family:inherit;',
  }))
export const CyclesDot = el
  .attrs({ tag: 'span' })
  .theme((t: T) => ({ width: '8px', height: '8px', borderRadius: '50%', flex: 'none', background: t.danger }))
export const SmallBtn = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignX: 'center', contentAlignY: 'center' })
  .theme((t: T) => ({
    fontSize: '13px', width: '28px', height: '28px', flex: 'none', borderRadius: '8px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border,
    background: 'transparent', color: t.muted,
    extendCss: `cursor:pointer;font-family:inherit;&:hover{color:${t.text};border-color:${t.accent};}`,
  }))
export const Canvas = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    flex: '1', minHeight: '0', overflow: 'auto', background: t.bg,
    extendCss: `background-image:radial-gradient(${t.dot} 1px,transparent 1px);background-size:24px 24px;`,
  }))

// ── article views (cycles / impact / table) ────────────────────────────────
export const Article = el.attrs({ tag: 'div' }).theme(() => ({ padding: '32px', maxWidth: '920px' }))
/** Article without the reading-width cap — the manifest table wants the room. */
export const ArticleWide = el.attrs({ tag: 'div' }).theme(() => ({ padding: '32px' }))
export const Eyebrow = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => ({ fontFamily: MONO, fontSize: '11px', color: t.faint, marginBottom: '16px' }))
export const H1 = txt
  .attrs({ tag: 'h1' })
  .theme(() => ({
    fontFamily: DISPLAY, fontSize: '30px', fontWeight: '700', margin: '0 0 8px',
    extendCss: 'letter-spacing:-.025em;text-wrap:pretty;',
  }))
export const Lead = txt
  .attrs({ tag: 'p' })
  .theme((t: T) => ({
    fontSize: '14.5px', color: t.muted, margin: '0 0 24px', maxWidth: '560px',
    extendCss: 'line-height:1.6;text-wrap:pretty;',
  }))
export const EmptyCard = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    padding: '44px', textAlign: 'center', borderRadius: '12px', color: t.muted,
    extendCss: `border:1px dashed ${t.border};`,
  }))
export const EmptyGlyph = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => ({ fontFamily: MONO, fontSize: '20px', color: t.ok, marginBottom: '8px' }))

/** The toolbar row above a cycle card list — chips left, meta right. */
export const CycleHead = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme(() => ({ marginBottom: '16px' }))
export const CycleCard = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border, borderRadius: '12px',
    padding: '20px', marginBottom: '16px', background: t.surface, extendCss: 'animation:lm-in .2s;',
  }))
export const CycleTag = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    fontFamily: MONO, fontSize: '10px', color: t.danger, padding: '4px 8px', borderRadius: '4px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.dangerRing, background: t.dangerSoft,
    extendCss: 'letter-spacing:.1em;',
  }))
export const CycleMeta = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: MONO, fontSize: '11px', color: t.faint }))
export const CycleSev = txt
  .attrs({ tag: 'span' })
  .variants(dim((t) => ({ high: { color: t.danger }, medium: { color: t.warn } })))
  .theme(() => ({ fontSize: '11.5px', fontWeight: '600' }))
export const CycleChip = el
  .attrs({ tag: 'button' })
  .theme((t: T) => ({
    fontFamily: MONO, fontSize: '12px', padding: '8px 12px', borderRadius: '8px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.dangerRing,
    background: t.dangerSoft, color: t.danger,
    extendCss: `cursor:pointer;&:hover{border-color:${t.accent};}`,
  }))
export const CycleArrow = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: MONO, fontSize: '12px', color: t.faint }))
export const CycleAdvice = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    marginTop: '16px', paddingTop: '16px', fontSize: '12.5px', color: t.muted,
    borderWidthTop: '1px', borderStyleTop: 'solid', borderColorTop: t.border, extendCss: 'line-height:1.55;',
  }))

export const StatGrid = el
  .attrs({ tag: 'div', contentDirection: 'inline', gap: 16 })
  .theme(() => ({
    // flexWrap has no Element prop — documented theme-level special case.
    flexWrap: 'wrap', marginBottom: '24px',
  }))
export const StatCard = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    flex: '1', minWidth: '152px', padding: '16px', borderRadius: '12px', background: t.surface,
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border,
  }))
export const StatLabel = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => ({ fontFamily: MONO, fontSize: '9.5px', color: t.faint, marginBottom: '8px', extendCss: 'letter-spacing:.12em;' }))
export const StatValue = txt
  .attrs({ tag: 'div' })
  .variants(dim((t) => ({
    plain: { color: t.text }, accent: { color: t.accent }, danger: { color: t.danger }, ok: { color: t.ok },
  })))
  .theme(() => ({ fontFamily: DISPLAY, fontSize: '26px', fontWeight: '700', extendCss: 'letter-spacing:-.02em;' }))

export const ImpactRow = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignY: 'center', gap: 16, block: true })
  .states(dim((t) => ({
    idle: { background: 'transparent', hover: { background: t.surface2 } },
    active: { background: t.surface2, hover: { background: t.surface2 } },
  })))
  .theme((t: T) => ({
    textAlign: 'left', border: 'none', padding: '12px',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border,
    extendCss: 'cursor:pointer;transition:background .1s;font-family:inherit;',
  }))
export const ImpactRank = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({ fontFamily: MONO, fontSize: '10.5px', color: t.faint, width: '24px', flex: 'none' }))
export const ImpactName = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    fontFamily: MONO, fontSize: '12.5px', width: '232px', flex: 'none', color: t.accent,
    extendCss: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
  }))
export const ImpactTrack = el
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    flex: '1', minWidth: '60px', height: '8px', borderRadius: '20px', background: t.surface2,
    overflow: 'hidden', display: 'block',
  }))
export const ImpactFill = el
  .attrs({ tag: 'span' })
  .variants(dim((t) => ({ accent: { background: t.accent }, danger: { background: t.danger } })))
  .theme(() => ({ display: 'block', height: '100%', borderRadius: '20px', extendCss: 'transition:width .3s;' }))
export const ImpactCount = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({ fontFamily: MONO, fontSize: '11.5px', width: '112px', flex: 'none', textAlign: 'right', color: t.muted }))

// ── manifest table ─────────────────────────────────────────────────────────
// CSS grid components: grid is outside Element's flex model, so the whole
// layout stays in the theme — the documented special case.
export const TableWrap = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border, borderRadius: '12px',
    overflow: 'hidden', background: t.surface,
  }))
export const TableHead = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    display: 'grid', padding: '12px 16px', background: t.surface2,
    fontFamily: MONO, fontSize: '9.5px', fontWeight: '500', color: t.faint,
    extendCss: 'grid-template-columns:1.9fr .9fr .9fr .7fr 1fr;letter-spacing:.1em;',
  }))
export const TableRow = el
  .attrs({ tag: 'button' })
  .states(dim((t) => ({
    idle: { background: 'transparent', hover: { background: t.surface2 } },
    active: { background: t.surface2, hover: { background: t.surface2 } },
  })))
  .theme((t: T) => ({
    display: 'grid', width: '100%', textAlign: 'left', border: 'none', padding: '12px 16px', alignItems: 'center',
    borderWidthTop: '1px', borderStyleTop: 'solid', borderColorTop: t.border,
    extendCss: 'grid-template-columns:1.9fr .9fr .9fr .7fr 1fr;cursor:pointer;transition:background .1s;font-family:inherit;',
  }))
export const CellName = el
  .attrs({ tag: 'span', contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme(() => ({ minWidth: '0' }))
export const KindDot = el
  .attrs({ tag: 'span' })
  .variants(dim((t) => ({ internal: { background: t.accent }, external: { background: t.ext } })))
  .theme(() => ({ width: '6px', height: '6px', borderRadius: '2px', flex: 'none' }))
export const CellText = txt
  .attrs({ tag: 'span' })
  .variants(dim((t) => ({
    plain: { color: t.text }, muted: { color: t.muted }, faint: { color: t.faint },
    accent: { color: t.accent }, warn: { color: t.warn },
  })))
  .theme(() => ({ fontFamily: MONO, fontSize: '12px', extendCss: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' }))
export const StatusBadge = txt
  .attrs({ tag: 'span' })
  .variants(dim((t) => ({
    ok: { color: t.ok, borderColor: t.okRing, background: t.okSoft },
    warn: { color: t.warn, borderColor: t.warnRing, background: t.warnSoft },
    danger: { color: t.danger, borderColor: t.dangerRing, background: t.dangerSoft },
  })))
  .theme(() => ({
    fontFamily: MONO, fontSize: '10.5px', padding: '2px 8px', borderRadius: '4px',
    borderWidth: '1px', borderStyle: 'solid', extendCss: 'justify-self:start;',
  }))

// ── detail panel ───────────────────────────────────────────────────────────
export const Panel = el
  .attrs({ tag: 'section', contentDirection: 'rows' })
  .theme((t: T) => ({
    width: 'clamp(280px,27vw,356px)', flex: 'none', minHeight: '0',
    borderWidthLeft: '1px', borderStyleLeft: 'solid', borderColorLeft: t.border, background: t.surface,
  }))
export const PanelHead = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    padding: '16px 16px 12px',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border,
  }))
export const PanelKind = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => ({ fontFamily: MONO, fontSize: '9.5px', color: t.faint, marginBottom: '8px', extendCss: 'letter-spacing:.12em;' }))
export const PanelName = txt
  .attrs({ tag: 'div' })
  .theme(() => ({ fontFamily: MONO, fontSize: '15px', fontWeight: '600', marginBottom: '8px', extendCss: 'word-break:break-all;' }))
export const ChipRow = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme(() => ({
    // flexWrap has no Element prop — documented theme-level special case.
    flexWrap: 'wrap',
  }))
export const MetaChip = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    fontFamily: MONO, fontSize: '10.5px', color: t.muted, padding: '2px 8px', borderRadius: '4px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border,
  }))
export const PanelBody = el.attrs({ tag: 'div' }).theme(() => ({ flex: '1', overflowY: 'auto', padding: '16px' }))
export const PanelSection = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => ({ fontFamily: MONO, fontSize: '9.5px', color: t.faint, margin: '20px 0 8px', extendCss: 'letter-spacing:.12em;' }))
export const CycleWarn = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.dangerRing, background: t.dangerSoft,
    borderRadius: '8px', padding: '12px', marginBottom: '16px',
  }))
export const CycleWarnTitle = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => ({ fontFamily: MONO, fontSize: '9.5px', color: t.danger, marginBottom: '4px', extendCss: 'letter-spacing:.12em;' }))
export const CycleWarnText = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => ({ fontSize: '12.5px', color: t.muted, extendCss: 'line-height:1.5;' }))
/**
 * A detector finding — severity-TRUE styling: info must read as information,
 * not as the danger card it used to borrow (CycleWarn).
 */
export const FindingCard = el
  .attrs({ tag: 'div' })
  .variants(dim((t) => ({
    error: { borderColor: t.dangerRing, background: t.dangerSoft },
    warning: { borderColor: t.warnRing, background: t.warnSoft },
    info: { borderColor: t.border, background: t.surface2 },
  })))
  .theme(() => ({
    borderWidth: '1px', borderStyle: 'solid',
    borderRadius: '8px', padding: '12px', marginBottom: '8px',
  }))
export const FindingTitle = txt
  .attrs({ tag: 'div' })
  .variants(dim((t) => ({
    error: { color: t.danger },
    warning: { color: t.warn },
    info: { color: t.muted },
  })))
  .theme(() => ({ fontFamily: MONO, fontSize: '9.5px', marginBottom: '4px', extendCss: 'letter-spacing:.12em;' }))
export const FindingText = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => ({ fontSize: '12.5px', color: t.muted, extendCss: 'line-height:1.5;' }))

export const MetricRow = el
  // block = full row width; without it the shrink-wrapped row leaves
  // spaceBetween nothing to distribute ("Resolution depth0").
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', contentAlignX: 'spaceBetween', block: true })
  .theme((t: T) => ({
    padding: '8px 0',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border,
  }))
export const MetricLabel = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontSize: '12.5px', color: t.muted }))
export const MetricValue = txt
  .attrs({ tag: 'span' })
  .variants(dim((t) => ({ plain: { color: t.text }, muted: { color: t.muted }, warn: { color: t.warn }, ok: { color: t.ok }, danger: { color: t.danger } })))
  .theme(() => ({ fontFamily: MONO, fontSize: '12px' }))
export const DepChip = el
  .attrs({ tag: 'button' })
  .variants(dim((t) => ({ internal: { color: t.accent }, external: { color: t.ext } })))
  .theme((t: T) => ({
    fontFamily: MONO, fontSize: '11.5px', padding: '4px 8px', borderRadius: '8px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border, background: 'transparent',
    extendCss: `cursor:pointer;&:hover{border-color:${t.accent};color:${t.text};}`,
  }))
export const PanelNote = txt.attrs({ tag: 'div' }).theme((t: T) => ({ fontSize: '12.5px', color: t.faint, padding: '8px 0' }))
export const PathBlock = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    fontFamily: MONO, fontSize: '11.5px', color: t.muted, background: t.codeBg,
    borderRadius: '8px', padding: '12px 16px', extendCss: 'line-height:1.9;white-space:pre-wrap;',
  }))

// ── footer ─────────────────────────────────────────────────────────────────
export const Footer = el
  .attrs({ tag: 'footer', contentDirection: 'inline', contentAlignY: 'center', gap: 16 })
  .theme((t: T) => ({
    height: '32px', flex: 'none', padding: '0 16px',
    borderWidthTop: '1px', borderStyleTop: 'solid', borderColorTop: t.border,
    background: t.surface, fontFamily: MONO, fontSize: '10.5px', color: t.faint,
  }))
export const FootSep = txt.attrs({ tag: 'span' }).theme((t: T) => ({ color: t.border }))
export const FootDanger = txt
  .attrs({ tag: 'span' })
  .variants(dim((t) => ({ danger: { color: t.danger }, ok: { color: t.ok }, warn: { color: t.warn } })))
  .theme(() => ({}))

// ── graph ──────────────────────────────────────────────────────────────────
/** The graph canvas padding frame (the SVG itself keeps its measured sizes). */
export const GraphPad = el.attrs({ tag: 'div' }).theme(() => ({ padding: '16px' }))

// ── matrix ─────────────────────────────────────────────────────────────────
// Cell geometry: 16px cells, 96px rotated-label band, 112px row labels — the
// components own the sizes; the view only maps data.
export const MatrixNote = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => ({ fontFamily: MONO, fontSize: '10.5px', color: t.faint, marginBottom: '8px' }))
export const MatrixPad = el.attrs({ tag: 'div' }).theme(() => ({ padding: '16px', display: 'inline-block' }))
export const MatrixHeadRow = el
  .attrs({ tag: 'div', contentDirection: 'inline' })
  .theme(() => ({}))
export const MatrixRow = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center' })
  .theme(() => ({}))
/** Top-left spacer aligning the column-label band with the row labels. */
export const MatrixCorner = el.attrs({ tag: 'div' }).theme(() => ({ width: '112px', flex: 'none' }))
export const MatrixColHead = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignX: 'center', contentAlignY: 'bottom' })
  .theme(() => ({ width: '16px', height: '96px', flex: 'none', overflow: 'hidden' }))
export const MatrixColLabel = txt
  .attrs({ tag: 'span' })
  .states(dim((t) => ({ idle: { color: t.faint }, active: { color: t.accent } })))
  .theme(() => ({
    fontFamily: MONO, fontSize: '9px',
    extendCss: 'writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;',
  }))
export const MatrixRowLabel = el
  .attrs({ tag: 'button' })
  .states(dim((t) => ({ idle: { color: t.muted }, active: { color: t.accent } })))
  .theme(() => ({
    // display:block — text truncation territory: a flex container never
    // ellipsizes its text (documented special case).
    display: 'block',
    width: '112px', flex: 'none', textAlign: 'right', padding: '0 8px 0 0',
    fontFamily: MONO, fontSize: '10px', border: 'none', background: 'transparent',
    extendCss: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;',
  }))
/** An inert non-edge cell; carries the diagonal marker when row === column. */
export const MatrixBlank = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignX: 'center', contentAlignY: 'center' })
  .theme(() => ({ width: '16px', height: '16px', flex: 'none' }))
export const MatrixDiag = el
  .attrs({ tag: 'span' })
  .theme((t: T) => ({ width: '4px', height: '4px', borderRadius: '50%', background: t.border, extendCss: 'opacity:.6;' }))
/** A real <button> per edge cell: keyboard-reachable, not just clickable. */
export const MatrixCellBtn = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignX: 'center', contentAlignY: 'center' })
  .theme(() => ({
    width: '16px', height: '16px', flex: 'none', padding: '0', border: 'none', background: 'transparent',
    extendCss: 'cursor:pointer;',
  }))
export const MatrixCellDot = el
  .attrs({ tag: 'span' })
  .variants(dim((t) => ({ dep: { background: t.accent }, back: { background: t.danger } })))
  .states(dim(() => ({
    lit: { extendCss: 'opacity:1;' },
    dim: { extendCss: 'opacity:.55;' },
  })))
  .theme(() => ({ width: '12px', height: '12px', borderRadius: '4px', extendCss: 'transition:opacity .15s;' }))

// ── ⌘K search dialog (docs-site style; shared shape with atlas) ────────────
export const SearchBackdrop = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'center' })
  .theme((t: T) => ({
    position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', zIndex: '80',
    fontFamily: "'Public Sans',system-ui,sans-serif", fontSize: '14px', color: t.text,
    extendCss: 'background:rgba(8,10,16,.55);backdrop-filter:blur(4px);',
  }))
export const SearchDialogCard = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'block' })
  .theme((t: T) => ({
    width: 'min(600px,92vw)', marginTop: '12vh', maxHeight: '60vh',
    borderRadius: '16px', overflow: 'hidden',
    background: t.surface, borderWidth: '1px', borderStyle: 'solid', borderColor: t.border,
    extendCss: 'box-shadow:0 24px 80px -16px rgba(0,0,0,.55);animation:lm-in .14s ease-out;',
  }))
export const SearchDialogHead = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme((t: T) => ({
    padding: '4px 16px', flex: 'none',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border,
  }))
export const SearchDialogField = el
  .attrs({ tag: 'input' })
  .theme((t: T) => ({
    flex: '1', border: 'none', background: 'transparent', color: t.text,
    fontSize: '15px', padding: '12px 0',
    extendCss: `outline:none;font-family:inherit;&::placeholder{color:${t.faint};}`,
  })) as unknown as InputEl
export const SearchResults = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'block' })
  .theme(() => ({ overflowY: 'auto', padding: '8px', flex: '1' }))
export const SearchRow = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignY: 'center', gap: 12, block: true })
  .states(dim((t) => ({
    active: { background: t.accentSoft },
    idle: { background: 'transparent', hover: { background: t.surface2 } },
  })))
  .theme(() => ({
    font: 'inherit', cursor: 'pointer', textAlign: 'left', border: 'none',
    padding: '8px 12px', borderRadius: '8px',
  }))
export const SearchRowName = txt
  .attrs({ tag: 'span' })
  .theme(() => ({ fontFamily: MONO, fontSize: '12.5px', fontWeight: '600', flex: 'none' }))
export const SearchRowKind = txt
  .attrs({ tag: 'span' })
  .variants(dim((t) => ({ internal: { color: t.accent }, external: { color: t.ext } })))
  .theme(() => ({ fontFamily: MONO, fontSize: '9.5px', flex: '1', minWidth: '0', extendCss: 'letter-spacing:.08em;' }))
export const SearchRowReason = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    fontFamily: MONO, fontSize: '9.5px', color: t.accent, flex: 'none',
    padding: '2px 8px', borderRadius: '4px', background: t.accentSoft,
    extendCss: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px;',
  }))
export const SearchEnterHint = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    fontFamily: MONO, fontSize: '9px', color: t.faint, flex: 'none',
    padding: '2px 8px', borderRadius: '4px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border,
  }))
export const SearchEmpty = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'center' })
  .theme((t: T) => ({ padding: '32px 16px', color: t.faint, fontSize: '13px', textAlign: 'center' }))
export const SearchFoot = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', gap: 12 })
  .theme((t: T) => ({
    padding: '8px 16px', flex: 'none',
    borderWidthTop: '1px', borderStyleTop: 'solid', borderColorTop: t.border,
    fontFamily: MONO, fontSize: '9px', color: t.faint,
  }))
export const SearchTrigger = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignY: 'center', gap: 8, block: true })
  .theme((t: T) => ({
    font: 'inherit', cursor: 'pointer', textAlign: 'left',
    maxWidth: '400px', padding: '8px 12px', borderRadius: '8px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border,
    background: t.bg, color: t.faint, fontSize: '13px',
    extendCss: `margin:0 auto;&:hover{border-color:${t.accent};}`,
  }))
export const SearchTriggerText = txt.attrs({ tag: 'span' }).theme(() => ({ flex: '1' }))
