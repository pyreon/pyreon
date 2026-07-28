/** Top bar — brand, segmented tabs, search, and the top-right controls. */
import { cx, dim, el, type InputEl, txt, type T } from '../kit'

export const TopBar = el.attrs({ tag: 'header', css: 'display:flex;flex-direction:row;align-items:center;' }).theme((t: T) => ({ height: '56px', flex: 'none', display: 'flex', alignItems: 'center', gap: '18px', padding: '0 18px', zIndex: '10', borderBottom: `1px solid ${t.border}`, background: `${t.surface}` }))

// ── brand ──
export const BrandRow = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme(() => ({ display: 'flex', alignItems: 'center', gap: '11px', minWidth: '190px' }))
export const BrandMark = el.attrs({ tag: 'div', css: 'display:flex;align-items:center;justify-content:center;' }).theme((t: T) => ({ width: '30px', height: '30px', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${t.accent}`, boxShadow: `0 4px 12px ${t.accentSoft}` }))
export const BrandGlyph = el.attrs({ tag: 'div' }).theme(() => ({ width: '13px', height: '13px', borderRadius: '3px', background: '#fff', transform: 'rotate(45deg)' }))
export const BrandText = txt.attrs({ tag: 'span' }).theme(() => cx("font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:16px;letter-spacing:-.01em;"))
export const BrandSub = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: '\'JetBrains Mono\',monospace', fontSize: '9.5px', letterSpacing: '.08em', color: `${t.faint}` }))

// ── segmented tabs (used by top bar, canvas zoom, addon tabs) ──
export const Segment = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme((t: T) => ({ display: 'flex', gap: '2px', padding: '3px', borderRadius: '10px', background: `${t.surface2}` }))
export const SegBtn = el
  .attrs({ tag: 'button' })
  .theme((t: T) => ({ font: 'inherit', fontSize: '13px', fontWeight: '600', cursor: 'pointer', border: 'none', padding: '7px 15px', borderRadius: '8px', transition: 'all .12s', color: `${t.muted}`, background: 'transparent' }))
  .states(dim((t) => ({
    active: { color: t.text, backgroundColor: t.bg, boxShadow: '0 1px 3px rgba(15,18,30,.12)' },
    idle: {},
  })))

// ── search ──
export const SearchWrap = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;justify-content:center;' }).theme(() => ({ flex: '1', display: 'flex', justifyContent: 'center' }))
export const SearchInner = el.attrs({ tag: 'div' }).theme(() => ({ position: 'relative', width: '100%', maxWidth: '420px' }))
export const SearchIcon = txt.attrs({ tag: 'span' }).theme((t: T) => ({ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: `${t.faint}` }))
export const SearchInput = el.attrs({ tag: 'input' }).theme((t: T) => ({ font: 'inherit', fontSize: '13px', width: '100%', padding: '9px 14px 9px 32px', borderRadius: '9px', outline: 'none', transition: 'border-color .12s,box-shadow .12s', border: `1px solid ${t.border}`, background: `${t.bg}`, color: `${t.text}`, focus: { borderColor: `${t.accent}`, boxShadow: `0 0 0 3px ${t.accentSoft}` } })) as unknown as InputEl
export const Kbd = txt.attrs({ tag: 'span' }).theme((t: T) => ({ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', fontFamily: '\'JetBrains Mono\',monospace', fontSize: '10px', padding: '1px 6px', borderRadius: '5px', color: `${t.faint}`, border: `1px solid ${t.border}` }))

// ── top-right ──
export const RightRow = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;justify-content:flex-end;' }).theme(() => ({ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '190px', justifyContent: 'flex-end' }))
export const IconButton = el.attrs({ tag: 'button', css: 'display:flex;align-items:center;justify-content:center;' }).theme((t: T) => ({ font: 'inherit', cursor: 'pointer', width: '34px', height: '34px', borderRadius: '9px', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${t.border}`, background: `${t.bg}`, color: `${t.text}`, hover: { borderColor: `${t.accent}` } }))
export const Avatar = el.attrs({ tag: 'div', css: 'display:flex;align-items:center;justify-content:center;' }).theme((t: T) => ({ width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '700', fontSize: '12px', fontFamily: '\'Space Grotesk\',sans-serif', background: `linear-gradient(135deg,${t.accent},${t.accent2})` }))
