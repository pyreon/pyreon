/**
 * Every Atlas workshop element — rocketstyle components on the `el`/`txt` bases,
 * styled through `.theme()` (raw CSS via the `extendCss` unistyle key) against
 * the reactive Atlas theme. Dynamic pieces use rocketstyle dimensions
 * (`.states` / `.variants` / `.sizes`). No inline styles anywhere.
 */
import type { ComponentFn } from '@pyreon/core'
import { el, txt } from './bases'
import { hexToRgba, type ThemeTokens } from './theme'

type T = ThemeTokens
const cx = (extendCss: string) => ({ extendCss })
/** el() is a generic Element and does not type input-specific attrs
 * (placeholder/value/onInput) — cast input components to a permissive shape. */
type InputEl = ComponentFn<Record<string, unknown>>

// ── frame ────────────────────────────────────────────────────────────────
export const Shell = el.attrs({ tag: 'div' }).theme((t: T) => cx(`height:100vh;display:flex;flex-direction:column;overflow:hidden;font-size:14px;background:${t.bg};color:${t.text};`))
export const TopBar = el.attrs({ tag: 'header' }).theme((t: T) => cx(`height:56px;flex:none;display:flex;align-items:center;gap:18px;padding:0 18px;z-index:10;border-bottom:1px solid ${t.border};background:${t.surface};`))
export const Body = el.attrs({ tag: 'div' }).theme(() => cx('flex:1;display:flex;min-height:0;'))
export const Sidebar = el.attrs({ tag: 'aside' }).theme((t: T) => cx(`width:264px;flex:none;display:flex;flex-direction:column;min-height:0;border-right:1px solid ${t.border};background:${t.surface};`))
export const Main = el.attrs({ tag: 'main' }).theme(() => cx('flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;'))
export const StatusBar = el.attrs({ tag: 'footer' }).theme((t: T) => cx(`height:30px;flex:none;display:flex;align-items:center;gap:14px;padding:0 16px;font-family:'JetBrains Mono',monospace;font-size:10.5px;border-top:1px solid ${t.border};background:${t.surface};color:${t.faint};`))
export const Row = el.attrs({ tag: 'div' }).theme(() => cx('display:flex;align-items:center;'))
export const Spacer = el.attrs({ tag: 'div' }).theme(() => cx('flex:1;'))

// ── brand ────────────────────────────────────────────────────────────────
export const BrandRow = el.attrs({ tag: 'div' }).theme(() => cx('display:flex;align-items:center;gap:11px;min-width:190px;'))
export const BrandMark = el.attrs({ tag: 'div' }).theme((t: T) => cx(`width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:${t.accent};box-shadow:0 4px 12px ${t.accentSoft};`))
export const BrandGlyph = el.attrs({ tag: 'div' }).theme(() => cx('width:13px;height:13px;border-radius:3px;background:#fff;transform:rotate(45deg);'))
export const BrandText = txt.attrs({ tag: 'span' }).theme(() => cx("font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:16px;letter-spacing:-.01em;"))
export const BrandSub = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.08em;color:${t.faint};`))
export const Col = el.attrs({ tag: 'div' }).theme(() => cx('display:flex;flex-direction:column;line-height:1.1;'))

// ── segmented tabs ─────────────────────────────────────────────────────────
export const Segment = el.attrs({ tag: 'div' }).theme((t: T) => cx(`display:flex;gap:2px;padding:3px;border-radius:10px;background:${t.surface2};`))
export const SegBtn = el
  .attrs({ tag: 'button' })
  .theme((t: T) => cx(`font:inherit;font-size:13px;font-weight:600;cursor:pointer;border:none;padding:7px 15px;border-radius:8px;transition:all .12s;color:${t.muted};background:transparent;`))
  .states({
    active: (t: T) => cx(`color:${t.text};background:${t.bg};box-shadow:0 1px 3px rgba(15,18,30,.12);`),
    idle: () => cx(''),
  })

// ── search ─────────────────────────────────────────────────────────────────
export const SearchWrap = el.attrs({ tag: 'div' }).theme(() => cx('flex:1;display:flex;justify-content:center;'))
export const SearchInner = el.attrs({ tag: 'div' }).theme(() => cx('position:relative;width:100%;max-width:420px;'))
export const SearchIcon = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`position:absolute;left:13px;top:50%;transform:translateY(-50%);font-size:13px;color:${t.faint};`))
export const SearchInput = el.attrs({ tag: 'input' }).theme((t: T) => cx(`font:inherit;font-size:13px;width:100%;padding:9px 14px 9px 32px;border-radius:9px;outline:none;transition:border-color .12s,box-shadow .12s;border:1px solid ${t.border};background:${t.bg};color:${t.text};&:focus{border-color:${t.accent};box-shadow:0 0 0 3px ${t.accentSoft};}`)) as unknown as InputEl
export const Kbd = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`position:absolute;right:11px;top:50%;transform:translateY(-50%);font-family:'JetBrains Mono',monospace;font-size:10px;padding:1px 6px;border-radius:5px;color:${t.faint};border:1px solid ${t.border};`))

// ── top-right ──────────────────────────────────────────────────────────────
export const RightRow = el.attrs({ tag: 'div' }).theme(() => cx('display:flex;align-items:center;gap:10px;min-width:190px;justify-content:flex-end;'))
export const IconButton = el.attrs({ tag: 'button' }).theme((t: T) => cx(`font:inherit;cursor:pointer;width:34px;height:34px;border-radius:9px;font-size:15px;display:flex;align-items:center;justify-content:center;border:1px solid ${t.border};background:${t.bg};color:${t.text};&:hover{border-color:${t.accent};}`))
export const Avatar = el.attrs({ tag: 'div' }).theme((t: T) => cx(`width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;font-family:'Space Grotesk',sans-serif;background:linear-gradient(135deg,${t.accent},${t.accent2});`))

// ── sidebar ────────────────────────────────────────────────────────────────
export const SideHead = el.attrs({ tag: 'div' }).theme(() => cx('padding:14px 16px 10px;display:flex;align-items:center;justify-content:space-between;'))
export const SideLabel = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;color:${t.faint};`))
export const CountPill = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-size:11px;padding:2px 8px;border-radius:20px;color:${t.muted};background:${t.surface2};`))
export const SideList = el.attrs({ tag: 'div' }).theme(() => cx('flex:1;overflow-y:auto;padding:0 10px 16px;'))
export const GroupLabel = el.attrs({ tag: 'div' }).theme((t: T) => cx(`margin:14px 0 5px;padding:0 8px;font-size:11px;font-weight:700;letter-spacing:.02em;display:flex;align-items:center;gap:7px;color:${t.muted};`))
export const GroupNum = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;font-size:10px;color:${t.accent};`))
export const CompBtn = el
  .attrs({ tag: 'button' })
  .theme((t: T) => cx(`font:inherit;cursor:pointer;width:100%;text-align:left;border:none;display:flex;align-items:center;gap:11px;padding:8px 10px;border-radius:8px;margin-bottom:1px;font-size:13.5px;transition:background .1s;font-weight:500;color:${t.muted};background:transparent;&:hover{background:${t.surface2};}`))
  .states({
    active: (t: T) => cx(`font-weight:600;color:${t.text};background:${t.accentSoft};&:hover{background:${t.accentSoft};}`),
    idle: () => cx(''),
  })
export const CompBar = el
  .attrs({ tag: 'span' })
  .theme((t: T) => cx(`width:3px;height:15px;border-radius:3px;flex:none;background:${t.border};`))
  .states({ active: (t: T) => cx(`background:${t.accent};`), idle: () => cx('') })
export const CompName = txt.attrs({ tag: 'span' }).theme(() => cx('flex:1;'))
export const NewTag = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-size:9px;font-weight:700;letter-spacing:.05em;padding:2px 6px;border-radius:5px;color:${t.accent};background:${t.accentSoft};`))
export const SideFoot = el.attrs({ tag: 'div' }).theme((t: T) => cx(`border-top:1px solid ${t.border};padding:12px 16px;display:flex;align-items:center;gap:9px;font-size:11.5px;color:${t.muted};`))
export const OkDot = el.attrs({ tag: 'span' }).theme((t: T) => cx(`width:8px;height:8px;border-radius:50%;background:${t.ok};box-shadow:0 0 0 3px ${t.okSoft};`))
export const Empty = el.attrs({ tag: 'div' }).theme((t: T) => cx(`text-align:center;padding:44px 16px;color:${t.faint};font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.6;`))

// ── canvas ─────────────────────────────────────────────────────────────────
export const CanvasBar = el.attrs({ tag: 'div' }).theme((t: T) => cx(`height:52px;flex:none;display:flex;align-items:center;gap:14px;padding:0 16px;border-bottom:1px solid ${t.border};background:${t.surface};`))
export const CanvasName = txt.attrs({ tag: 'span' }).theme(() => cx("font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:15px;"))
export const CanvasPath = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;font-size:10px;color:${t.faint};`))
export const ZoomLabel = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;font-size:11px;width:42px;text-align:center;color:${t.muted};`))
export const ZoomBtn = el.attrs({ tag: 'button' }).theme((t: T) => cx(`font:inherit;cursor:pointer;border:none;background:transparent;width:26px;height:26px;border-radius:6px;font-size:15px;color:${t.text};&:hover{background:${t.surface2};}`))
export const Stage = el.attrs({ tag: 'div' }).theme((t: T) => cx(`flex:1;min-height:0;overflow:auto;display:flex;align-items:center;justify-content:center;padding:40px;background-color:${t.bg};background-image:radial-gradient(${t.dotColor} 1px,transparent 1px);background-size:22px 22px;`))
export const Frame = el.attrs({ tag: 'div' }).theme((t: T) => cx(`border-radius:16px;overflow:hidden;box-shadow:0 20px 50px -24px rgba(15,18,30,.35);border:1px solid ${t.border};background:${t.surface};`))
export const FrameChrome = el.attrs({ tag: 'div' }).theme((t: T) => cx(`display:flex;align-items:center;justify-content:space-between;padding:9px 14px;border-bottom:1px solid ${t.border};background:${t.chrome};font-family:'JetBrains Mono',monospace;font-size:10px;color:${t.muted};`))
export const PreviewSurface = el.attrs({ tag: 'div' }).theme(() => cx('padding:56px 40px;display:flex;align-items:center;justify-content:center;min-height:220px;'))

// ── addon panel + controls ─────────────────────────────────────────────────
export const AddonPanel = el.attrs({ tag: 'section' }).theme((t: T) => cx(`width:352px;flex:none;display:flex;flex-direction:column;min-height:0;border-left:1px solid ${t.border};background:${t.surface};`))
export const AddonTabs = el.attrs({ tag: 'div' }).theme((t: T) => cx(`display:flex;padding:6px 8px;gap:2px;overflow-x:auto;border-bottom:1px solid ${t.border};`))
export const AddonBody = el.attrs({ tag: 'div' }).theme(() => cx('flex:1;overflow-y:auto;padding:16px;'))
export const CtrlRow = el.attrs({ tag: 'div' }).theme(() => cx('margin-bottom:16px;animation:atlas-in .18s;'))
export const CtrlHead = el.attrs({ tag: 'div' }).theme(() => cx('display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;'))
export const CtrlLabel = txt.attrs({ tag: 'label' }).theme(() => cx('font-size:12px;font-weight:600;'))
export const CtrlType = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;font-size:10px;color:${t.faint};`))
export const TextInput = el.attrs({ tag: 'input' }).theme((t: T) => cx(`font:inherit;font-size:13px;width:100%;padding:8px 11px;border-radius:8px;outline:none;border:1px solid ${t.border};background:${t.bg};color:${t.text};&:focus{border-color:${t.accent};}`)) as unknown as InputEl
export const EnumWrap = el.attrs({ tag: 'div' }).theme(() => cx('display:flex;flex-wrap:wrap;gap:5px;'))
export const EnumBtn = el
  .attrs({ tag: 'button' })
  .theme((t: T) => cx(`font:inherit;font-size:12px;cursor:pointer;padding:6px 12px;border-radius:7px;text-transform:capitalize;transition:border-color .1s,color .1s;border:1px solid ${t.border};color:${t.muted};background:transparent;&:hover{border-color:${t.accent};color:${t.text};}`))
  .states({ active: (t: T) => cx(`border-color:${t.accent};color:${t.text};background:${t.accentSoft};`), idle: () => cx('') })
export const Switch = el
  .attrs({ tag: 'button' })
  .theme((t: T) => cx(`cursor:pointer;border:none;padding:0;width:42px;height:24px;border-radius:20px;position:relative;transition:background .15s;background:${t.border};`))
  .states({ on: (t: T) => cx(`background:${t.accent};`), off: () => cx('') })
export const Knob = el
  .attrs({ tag: 'span' })
  .theme(() => cx('position:absolute;top:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .15s;left:2px;'))
  .states({ on: () => cx('left:20px;'), off: () => cx('') })
export const RangeRow = el.attrs({ tag: 'div' }).theme(() => cx('display:flex;align-items:center;gap:12px;'))
export const Range = el.attrs({ tag: 'input' }).theme(() => cx('flex:1;')) as unknown as InputEl
export const RangeVal = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;font-size:12px;width:34px;text-align:right;color:${t.muted};`))
export const SwatchWrap = el.attrs({ tag: 'div' }).theme(() => cx('display:flex;flex-wrap:wrap;gap:7px;'))
export const ResetBtn = el.attrs({ tag: 'button' }).theme((t: T) => cx(`font:inherit;font-size:12px;cursor:pointer;width:100%;margin-top:4px;padding:9px;border-radius:8px;border:1px dashed ${t.border};background:transparent;color:${t.muted};&:hover{border-color:${t.accent};color:${t.text};}`))
export const StatusText = txt.attrs({ tag: 'span' }).theme(() => cx(''))
export const StatusDim = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`color:${t.border};`))

// ── swatch (dynamic color via variant dimension is impractical; use el + a
//    per-instance color passed through a data attribute-free wrapper) ────────
export const Swatch = el
  .attrs({ tag: 'button' })
  .theme((t: T) => cx(`cursor:pointer;width:26px;height:26px;border-radius:7px;padding:0;border:2px solid ${t.border};`))
  .states({ active: (t: T) => cx(`border-color:${t.accent};`), idle: () => cx('') })

// ── demo components (variants / sizes / states dimensions) ──────────────────
const btnBase = (t: T) =>
  cx(`font-family:'Public Sans',sans-serif;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:9px;border:1px solid transparent;transition:transform .08s;border-radius:10px;font-size:14.5px;padding:11px 20px;background:${t.accent};color:#fff;box-shadow:0 6px 16px -6px ${hexToRgba(t.accent, 0.6)};`)
export const DemoButton = el
  .attrs({ tag: 'button' })
  .theme(btnBase)
  .variants({
    solid: (t: T) => cx(`background:${t.accent};color:#fff;box-shadow:0 6px 16px -6px ${hexToRgba(t.accent, 0.6)};`),
    soft: (t: T) => cx(`background:${hexToRgba(t.accent, 0.14)};color:${t.accent};box-shadow:none;`),
    outline: (t: T) => cx(`background:transparent;color:${t.accent};border-color:${hexToRgba(t.accent, 0.5)};box-shadow:none;`),
    ghost: (t: T) => cx(`background:transparent;color:${t.accent};box-shadow:none;`),
  })
  .sizes({
    sm: () => cx('font-size:13px;padding:8px 15px;'),
    md: () => cx('font-size:14.5px;padding:11px 20px;'),
    lg: () => cx('font-size:16px;padding:14px 26px;'),
  })

export const DemoBadge = el
  .attrs({ tag: 'span' })
  .theme((t: T) => cx(`font-family:'Public Sans',sans-serif;font-size:12.5px;font-weight:600;padding:4px 11px;border-radius:20px;display:inline-flex;align-items:center;gap:7px;border:1px solid transparent;background:${hexToRgba(t.accent, 0.14)};color:${t.accent};`))
  .variants({
    soft: (t: T) => cx(`background:${hexToRgba(t.accent, 0.14)};color:${t.accent};`),
    solid: (t: T) => cx(`background:${t.accent};color:#fff;`),
    outline: (t: T) => cx(`background:transparent;color:${t.accent};border-color:${hexToRgba(t.accent, 0.5)};`),
  })

export const IconDot = el.attrs({ tag: 'span' }).theme(() => cx('width:7px;height:7px;border-radius:9px;background:currentColor;display:inline-block;'))

export const ToggleRoot = el.attrs({ tag: 'label' }).theme((t: T) => cx(`display:inline-flex;align-items:center;gap:11px;cursor:pointer;font-family:'Public Sans',sans-serif;color:${t.text};`))
export const ToggleTrack = el
  .attrs({ tag: 'span' })
  .theme((t: T) => cx(`cursor:pointer;width:46px;height:26px;border-radius:20px;position:relative;display:inline-block;transition:background .15s;background:${t.border};`))
  .states({ on: (t: T) => cx(`background:${t.accent};`), off: () => cx('') })
export const ToggleKnob = el
  .attrs({ tag: 'span' })
  .theme(() => cx('position:absolute;top:2px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .15s;width:22px;height:22px;left:2px;'))
  .states({ on: () => cx('left:22px;'), off: () => cx('') })
export const ToggleText = txt.attrs({ tag: 'span' }).theme(() => cx('font-size:14px;font-weight:500;'))

export const FieldRoot = el.attrs({ tag: 'div' }).theme(() => cx("width:260px;text-align:left;font-family:'Public Sans',sans-serif;"))
export const FieldLabel = txt.attrs({ tag: 'label' }).theme((t: T) => cx(`display:block;font-size:12.5px;font-weight:600;margin-bottom:6px;color:${t.text};`))
export const FieldInput = (el
  .attrs({ tag: 'input' })
  .theme((t: T) => cx(`width:100%;font-family:'Public Sans',sans-serif;font-size:14px;padding:10px 13px;border-radius:9px;outline:none;color:${t.text};background:${t.bg};border:1.5px solid ${t.border};`))
  .states({
    focus: (t: T) => cx(`border-color:${t.accent};box-shadow:0 0 0 3px ${hexToRgba(t.accent, 0.18)};`),
    error: (t: T) => cx(`border-color:${t.danger};box-shadow:0 0 0 3px rgba(224,91,91,.15);`),
    default: () => cx(''),
  })) as unknown as InputEl
export const FieldHelper = txt
  .attrs({ tag: 'div' })
  .theme((t: T) => cx(`font-size:11.5px;margin-top:6px;color:${t.muted};`))
  .states({ error: (t: T) => cx(`color:${t.danger};`), default: () => cx('') })

// ── docs view (autodocs) ───────────────────────────────────────────────────
export const DocsWrap = el.attrs({ tag: 'div' }).theme((t: T) => cx(`flex:1;overflow-y:auto;padding:36px 32px;background:${t.bg};`))
export const DocsArticle = el.attrs({ tag: 'article' }).theme(() => cx('max-width:720px;margin:0 auto;'))
export const DocsTitleRow = el.attrs({ tag: 'div' }).theme(() => cx('display:flex;align-items:center;gap:10px;margin-bottom:10px;'))
export const DocsTitle = txt.attrs({ tag: 'h1' }).theme(() => cx("font-family:'Space Grotesk',sans-serif;font-size:30px;font-weight:700;margin:0;letter-spacing:-.02em;"))
export const DocsStatus = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-size:11px;font-weight:700;letter-spacing:.05em;padding:3px 9px;border-radius:6px;text-transform:capitalize;color:${t.accent};background:${t.accentSoft};`))
export const DocsDesc = txt.attrs({ tag: 'p' }).theme((t: T) => cx(`font-size:16px;line-height:1.6;margin:0 0 26px;max-width:600px;color:${t.muted};`))
export const DocsPreview = el.attrs({ tag: 'div' }).theme((t: T) => cx(`border-radius:16px;border:1px solid ${t.border};background:${t.surface};padding:48px;display:flex;align-items:center;justify-content:center;margin-bottom:26px;`))
export const DocsH2 = txt.attrs({ tag: 'h2' }).theme(() => cx("font-family:'Space Grotesk',sans-serif;font-size:18px;margin:0 0 12px;"))
export const PropsTable = el.attrs({ tag: 'div' }).theme((t: T) => cx(`border:1px solid ${t.border};border-radius:12px;overflow:hidden;margin-bottom:26px;`))
export const PropsHead = el.attrs({ tag: 'div' }).theme((t: T) => cx(`display:grid;grid-template-columns:1.2fr 1fr 1fr;padding:10px 16px;background:${t.surface2};font-size:11px;font-weight:700;letter-spacing:.04em;color:${t.muted};`))
export const PropsRow = el.attrs({ tag: 'div' }).theme((t: T) => cx(`display:grid;grid-template-columns:1.2fr 1fr 1fr;padding:11px 16px;border-top:1px solid ${t.border};font-size:12.5px;align-items:center;`))
export const HeadCell = txt.attrs({ tag: 'span' }).theme(() => cx(''))
export const PropName = txt.attrs({ tag: 'span' }).theme(() => cx("font-family:'JetBrains Mono',monospace;font-weight:600;"))
export const PropKind = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;color:${t.accent};`))
export const PropDef = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;color:${t.muted};`))
export const UsagePre = el.attrs({ tag: 'pre' }).theme((t: T) => cx(`margin:0;padding:18px;border-radius:12px;font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1.6;overflow:auto;white-space:pre-wrap;background:${t.codeBg};color:${t.codeFg};`))
