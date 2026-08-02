/**
 * Observatory chrome — every styled component of the Loom UI, rocketstyle on
 * the `el`/`txt` bases, tokens from `./theme` via the local `T` alias.
 * Layout in `.attrs()`, CSS in `.theme()`, raw tails through `extendCss`.
 */
import { dim, el, txt, DISPLAY, MONO, type InputEl, type T } from './kit'

// ── frame ──────────────────────────────────────────────────────────────────
export const Shell = el
  .attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' })
  .theme((t: T) => ({
    height: '100vh', overflow: 'hidden', fontSize: '14px',
    fontFamily: "'Public Sans',system-ui,sans-serif",
    background: t.bg, color: t.text,
  }))
export const Body = el
  .attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:stretch;' })
  .theme(() => ({ flex: '1', minHeight: '0' }))
export const Main = el
  .attrs({ tag: 'main', css: 'display:flex;flex-direction:column;align-items:stretch;' })
  .theme(() => ({ flex: '1', minWidth: '0', minHeight: '0' }))
export const Row = el
  // Layout lives in the THEME, not the attrs `css` string: a per-instance
  // `css` prop OVERRIDES the attrs default (props win over .attrs), and the
  // brand block's `<Row css="gap:11px">` was silently throwing the row
  // layout away — the logo/name/subtitle stacked and clipped.
  .attrs({ tag: 'div' })
  .theme(() => ({ display: 'flex', flexDirection: 'row', alignItems: 'center' }))
export const Col = el.attrs({ tag: 'div' }).theme(() => ({ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }))
export const Spacer = el.attrs({ tag: 'div' }).theme(() => ({ flex: '1', minWidth: '8px' }))

// ── header ─────────────────────────────────────────────────────────────────
export const Header = el
  .attrs({ tag: 'header', css: 'display:flex;flex-direction:row;align-items:center;' })
  .theme((t: T) => ({
    height: '56px', flex: 'none', gap: '18px', padding: '0 18px',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border,
    background: t.surface,
  }))
export const BrandMark = el
  .attrs({ tag: 'div', css: 'display:flex;align-items:center;justify-content:center;' })
  .theme((t: T) => ({
    width: '30px', height: '30px', borderRadius: '9px', background: t.accent,
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
  .attrs({ tag: 'nav', css: 'display:flex;flex-direction:row;' })
  .theme((t: T) => ({ gap: '2px', background: t.surface2, padding: '3px', borderRadius: '10px', flex: 'none' }))
export const NavTab = el
  .attrs({ tag: 'button' })
  .states(dim((t) => ({
    idle: { color: t.muted, background: 'transparent', hover: { color: t.text } },
    active: { color: t.text, background: t.surface, extendCss: 'box-shadow:0 1px 3px rgba(0,0,0,.25);' },
  })))
  .theme(() => ({
    fontSize: '12.5px', fontWeight: '600', border: 'none', padding: '7px 13px',
    borderRadius: '8px', extendCss: 'white-space:nowrap;cursor:pointer;transition:all .12s;font-family:inherit;',
  }))

export const SearchWrap = el
  .attrs({ tag: 'div' })
  .theme(() => ({ position: 'relative', width: '100%', maxWidth: '400px', extendCss: 'margin:0 auto;' }))
export const SearchGlyph = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    position: 'absolute', color: t.faint, fontSize: '13px',
    extendCss: 'left:13px;top:50%;transform:translateY(-50%);',
  }))
export const SearchInput = el
  .attrs({ tag: 'input' })
  .theme((t: T) => ({
    fontSize: '13px', width: '100%', padding: '9px 50px 9px 32px', borderRadius: '9px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border,
    background: t.bg, color: t.text,
    extendCss: `outline:none;font-family:inherit;transition:border-color .12s,box-shadow .12s;&:focus{border-color:${t.accent};box-shadow:0 0 0 3px ${t.accentSoft};}`,
  })) as unknown as InputEl
export const SearchKbd = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    position: 'absolute', fontFamily: MONO, fontSize: '10px', color: t.faint,
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border, borderRadius: '5px',
    padding: '1px 6px', extendCss: 'right:11px;top:50%;transform:translateY(-50%);',
  }))

export const HealthPill = el
  .attrs({ tag: 'div', css: 'display:flex;align-items:center;' })
  .states(dim((t) => ({
    ok: { borderColor: t.okRing, background: t.okSoft },
    bad: { borderColor: t.dangerRing, background: t.dangerSoft },
  })))
  .theme(() => ({ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '7px', padding: '5px 11px', borderRadius: '20px', borderWidth: '1px', borderStyle: 'solid', flex: 'none' }))
export const HealthDot = el
  .attrs({ tag: 'span' })
  .states(dim((t) => ({ ok: { background: t.ok }, bad: { background: t.danger } })))
  .theme(() => ({ width: '7px', height: '7px', borderRadius: '50%', extendCss: 'animation:lm-pulse 2.4s infinite;' }))
export const HealthText = txt
  .attrs({ tag: 'span' })
  .states(dim((t) => ({ ok: { color: t.ok }, bad: { color: t.danger } })))
  .theme(() => ({ fontFamily: MONO, fontSize: '10.5px' }))

export const IconBtn = el
  .attrs({ tag: 'button', css: 'display:flex;align-items:center;justify-content:center;' })
  .theme((t: T) => ({
    display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    width: '34px', height: '34px', borderRadius: '9px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border,
    background: t.bg, color: t.text, fontSize: '15px',
    extendCss: `cursor:pointer;font-family:inherit;&:hover{border-color:${t.accent};}`,
  }))

// ── sidebar ────────────────────────────────────────────────────────────────
export const Sidebar = el
  .attrs({ tag: 'aside' })
  .theme((t: T) => ({
    width: 'clamp(200px,20vw,268px)', flex: 'none', display: 'flex', flexDirection: 'column', minHeight: '0',
    borderWidthRight: '1px', borderStyleRight: 'solid', borderColorRight: t.border, background: t.surface,
  }))
export const KindRow = el
  .attrs({ tag: 'div', css: 'display:flex;flex-direction:row;' })
  .theme((t: T) => ({
    padding: '12px 14px', gap: '5px',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border,
  }))
export const KindBtn = el
  .attrs({ tag: 'button' })
  .states(dim((t) => ({
    idle: { borderColor: t.border, color: t.muted, background: 'transparent' },
    active: { borderColor: t.accent, color: '#0f0f14', background: t.accent },
  })))
  .theme(() => ({
    fontSize: '11.5px', fontWeight: '600', flex: '1', padding: '6px 4px', borderRadius: '7px',
    borderWidth: '1px', borderStyle: 'solid',
    extendCss: 'cursor:pointer;transition:all .12s;font-family:inherit;text-align:center;',
  }))
export const SideList = el
  .attrs({ tag: 'div' })
  .theme(() => ({ flex: '1', overflowY: 'auto', padding: '0 10px 16px' }))
export const GroupHead = el
  .attrs({ tag: 'div', css: 'display:flex;align-items:center;' })
  .theme((t: T) => ({
    display: 'flex', flexDirection: 'row', alignItems: 'center',
    margin: '14px 0 5px', padding: '0 8px', fontSize: '11px', fontWeight: '700', color: t.muted, gap: '7px',
  }))
export const GroupNum = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: MONO, fontSize: '10px', color: t.accent }))
export const GroupGlyph = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: MONO, fontSize: '10px', color: t.faint }))
export const GroupLabel = txt.attrs({ tag: 'span' }).theme(() => ({ flex: '1' }))
export const GroupCount = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: MONO, fontSize: '10px', color: t.faint }))

export const PkgBtn = el
  .attrs({ tag: 'button', css: 'display:flex;flex-direction:row;align-items:center;width:100%;text-align:left;' })
  .states(dim((t) => ({
    idle: { color: t.text, background: 'transparent', hover: { background: t.surface2 } },
    active: { color: t.accent, background: t.accentSoft, hover: { background: t.accentSoft } },
  })))
  .theme(() => ({
    border: 'none', gap: '10px', padding: '7px 10px', borderRadius: '8px', marginBottom: '1px',
    extendCss: 'cursor:pointer;transition:background .1s;font-family:inherit;',
  }))
export const PkgBar = el
  .attrs({ tag: 'span' })
  .states(dim((t) => ({ idle: { background: 'transparent' }, active: { background: t.accent } })))
  .theme(() => ({ width: '3px', height: '15px', borderRadius: '3px', flex: 'none' }))
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
    padding: '11px 14px', fontFamily: MONO, fontSize: '10.5px', color: t.muted,
  }))

// ── main toolbar + canvas ──────────────────────────────────────────────────
export const ViewBar = el
  .attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;flex-wrap:wrap;' })
  .theme((t: T) => ({
    flex: 'none', gap: '10px 14px', padding: '9px 16px',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border, background: t.surface,
  }))
export const ViewTitle = txt
  .attrs({ tag: 'span' })
  .theme(() => ({ fontFamily: DISPLAY, fontWeight: '600', fontSize: '15px', extendCss: 'white-space:nowrap;' }))
export const ViewEyebrow = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    fontFamily: MONO, fontSize: '10px', color: t.faint,
    extendCss: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
  }))
export const CyclesBtn = el
  .attrs({ tag: 'button', css: 'display:flex;align-items:center;' })
  .states(dim((t) => ({
    on: { borderColor: t.dangerRing, background: t.dangerSoft, color: t.danger },
    off: { borderColor: t.border, background: 'transparent', color: t.muted },
  })))
  .theme(() => ({
    display: 'flex', flexDirection: 'row', alignItems: 'center',
    fontSize: '12px', padding: '6px 12px', borderRadius: '8px', gap: '7px',
    borderWidth: '1px', borderStyle: 'solid',
    extendCss: 'cursor:pointer;white-space:nowrap;transition:all .12s;font-family:inherit;',
  }))
export const CyclesDot = el
  .attrs({ tag: 'span' })
  .theme((t: T) => ({ width: '7px', height: '7px', borderRadius: '50%', background: t.danger }))
export const SmallBtn = el
  .attrs({ tag: 'button', css: 'display:flex;align-items:center;justify-content:center;' })
  .theme((t: T) => ({
    display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
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
export const Article = el.attrs({ tag: 'div' }).theme(() => ({ padding: '30px 32px', maxWidth: '920px' }))
export const Eyebrow = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => ({ fontFamily: MONO, fontSize: '11px', color: t.faint, marginBottom: '14px' }))
export const H1 = txt
  .attrs({ tag: 'h1' })
  .theme(() => ({
    fontFamily: DISPLAY, fontSize: '30px', fontWeight: '700', margin: '0 0 10px',
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
    padding: '44px', textAlign: 'center', borderRadius: '14px', color: t.muted,
    extendCss: `border:1px dashed ${t.border};`,
  }))
export const EmptyGlyph = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => ({ fontFamily: MONO, fontSize: '20px', color: t.ok, marginBottom: '10px' }))

export const CycleCard = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border, borderRadius: '14px',
    padding: '20px', marginBottom: '14px', background: t.surface, extendCss: 'animation:lm-in .2s;',
  }))
export const CycleTag = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    fontFamily: MONO, fontSize: '10px', color: t.danger, padding: '3px 9px', borderRadius: '6px',
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
    fontFamily: MONO, fontSize: '12px', padding: '6px 11px', borderRadius: '8px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.dangerRing,
    background: t.dangerSoft, color: t.danger,
    extendCss: `cursor:pointer;&:hover{border-color:${t.accent};}`,
  }))
export const CycleArrow = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: MONO, fontSize: '12px', color: t.faint }))
export const CycleAdvice = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    marginTop: '14px', paddingTop: '14px', fontSize: '12.5px', color: t.muted,
    borderWidthTop: '1px', borderStyleTop: 'solid', borderColorTop: t.border, extendCss: 'line-height:1.55;',
  }))

export const StatGrid = el
  .attrs({ tag: 'div', css: 'display:flex;flex-direction:row;flex-wrap:wrap;' })
  .theme(() => ({ gap: '16px', marginBottom: '22px' }))
export const StatCard = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    flex: '1', minWidth: '150px', padding: '16px 18px', borderRadius: '12px', background: t.surface,
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
  .attrs({ tag: 'button', css: 'display:flex;flex-direction:row;align-items:center;width:100%;text-align:left;' })
  .states(dim((t) => ({
    idle: { background: 'transparent', hover: { background: t.surface2 } },
    active: { background: t.surface2, hover: { background: t.surface2 } },
  })))
  .theme((t: T) => ({
    border: 'none', gap: '14px', padding: '11px 12px',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border,
    extendCss: 'cursor:pointer;transition:background .1s;font-family:inherit;',
  }))
export const ImpactRank = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({ fontFamily: MONO, fontSize: '10.5px', color: t.faint, width: '22px', flex: 'none' }))
export const ImpactName = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    fontFamily: MONO, fontSize: '12.5px', width: '230px', flex: 'none', color: t.accent,
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
  .theme((t: T) => ({ fontFamily: MONO, fontSize: '11.5px', width: '110px', flex: 'none', textAlign: 'right', color: t.muted }))

// ── manifest table ─────────────────────────────────────────────────────────
export const TableWrap = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border, borderRadius: '12px',
    overflow: 'hidden', background: t.surface,
  }))
export const TableHead = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    display: 'grid', padding: '11px 16px', background: t.surface2,
    fontFamily: MONO, fontSize: '9.5px', fontWeight: '500', color: t.faint,
    extendCss: 'grid-template-columns:1.9fr .9fr .9fr .7fr 1fr;letter-spacing:.1em;',
  }))
export const TableRow = el
  .attrs({ tag: 'button', css: 'width:100%;text-align:left;' })
  .states(dim((t) => ({
    idle: { background: 'transparent', hover: { background: t.surface2 } },
    active: { background: t.surface2, hover: { background: t.surface2 } },
  })))
  .theme((t: T) => ({
    display: 'grid', border: 'none', padding: '11px 16px', alignItems: 'center',
    borderWidthTop: '1px', borderStyleTop: 'solid', borderColorTop: t.border,
    extendCss: 'grid-template-columns:1.9fr .9fr .9fr .7fr 1fr;cursor:pointer;transition:background .1s;font-family:inherit;',
  }))
export const CellName = el
  .attrs({ tag: 'span', css: 'display:flex;align-items:center;' })
  .theme(() => ({ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '9px', minWidth: '0' }))
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
    fontFamily: MONO, fontSize: '10.5px', padding: '2px 8px', borderRadius: '6px',
    borderWidth: '1px', borderStyle: 'solid', extendCss: 'justify-self:start;',
  }))

// ── detail panel ───────────────────────────────────────────────────────────
export const Panel = el
  .attrs({ tag: 'section' })
  .theme((t: T) => ({
    width: 'clamp(280px,27vw,356px)', flex: 'none', display: 'flex', flexDirection: 'column', minHeight: '0',
    borderWidthLeft: '1px', borderStyleLeft: 'solid', borderColorLeft: t.border, background: t.surface,
  }))
export const PanelHead = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    padding: '18px 18px 14px',
    borderWidthBottom: '1px', borderStyleBottom: 'solid', borderColorBottom: t.border,
  }))
export const PanelKind = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => ({ fontFamily: MONO, fontSize: '9.5px', color: t.faint, marginBottom: '8px', extendCss: 'letter-spacing:.12em;' }))
export const PanelName = txt
  .attrs({ tag: 'div' })
  .theme(() => ({ fontFamily: MONO, fontSize: '15px', fontWeight: '600', marginBottom: '8px', extendCss: 'word-break:break-all;' }))
export const ChipRow = el
  .attrs({ tag: 'div', css: 'display:flex;flex-direction:row;flex-wrap:wrap;' })
  .theme(() => ({ gap: '6px' }))
export const MetaChip = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    fontFamily: MONO, fontSize: '10.5px', color: t.muted, padding: '2px 8px', borderRadius: '6px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border,
  }))
export const PanelBody = el.attrs({ tag: 'div' }).theme(() => ({ flex: '1', overflowY: 'auto', padding: '16px 18px' }))
export const PanelSection = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => ({ fontFamily: MONO, fontSize: '9.5px', color: t.faint, margin: '20px 0 10px', extendCss: 'letter-spacing:.12em;' }))
export const CycleWarn = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.dangerRing, background: t.dangerSoft,
    borderRadius: '10px', padding: '12px 13px', marginBottom: '18px',
  }))
export const CycleWarnTitle = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => ({ fontFamily: MONO, fontSize: '9.5px', color: t.danger, marginBottom: '6px', extendCss: 'letter-spacing:.12em;' }))
export const CycleWarnText = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => ({ fontSize: '12.5px', color: t.muted, extendCss: 'line-height:1.5;' }))
export const MetricRow = el
  .attrs({ tag: 'div', css: 'display:flex;align-items:center;justify-content:space-between;' })
  .theme((t: T) => ({
    display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    // Full width, or the shrink-wrapped row leaves space-between nothing to
    // distribute and label+value render jammed ("Resolution depth0").
    width: '100%',
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
    fontFamily: MONO, fontSize: '11.5px', padding: '5px 10px', borderRadius: '7px',
    borderWidth: '1px', borderStyle: 'solid', borderColor: t.border, background: 'transparent',
    extendCss: `cursor:pointer;&:hover{border-color:${t.accent};color:${t.text};}`,
  }))
export const PanelNote = txt.attrs({ tag: 'div' }).theme((t: T) => ({ fontSize: '12.5px', color: t.faint, padding: '6px 0' }))
export const PathBlock = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    fontFamily: MONO, fontSize: '11.5px', color: t.muted, background: t.codeBg,
    borderRadius: '10px', padding: '12px 14px', extendCss: 'line-height:1.9;white-space:pre-wrap;',
  }))

// ── footer ─────────────────────────────────────────────────────────────────
export const Footer = el
  .attrs({ tag: 'footer', css: 'display:flex;flex-direction:row;align-items:center;' })
  .theme((t: T) => ({
    height: '30px', flex: 'none', gap: '14px', padding: '0 16px',
    borderWidthTop: '1px', borderStyleTop: 'solid', borderColorTop: t.border,
    background: t.surface, fontFamily: MONO, fontSize: '10.5px', color: t.faint,
  }))
export const FootSep = txt.attrs({ tag: 'span' }).theme((t: T) => ({ color: t.border }))
export const FootDanger = txt
  .attrs({ tag: 'span' })
  .variants(dim((t) => ({ danger: { color: t.danger }, ok: { color: t.ok }, warn: { color: t.warn } })))
  .theme(() => ({}))

// ── matrix ─────────────────────────────────────────────────────────────────
export const MatrixNote = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => ({ fontFamily: MONO, fontSize: '10.5px', color: t.faint, marginBottom: '8px' }))
export const MatrixPad = el.attrs({ tag: 'div' }).theme(() => ({ padding: '14px 16px', display: 'inline-block' }))
