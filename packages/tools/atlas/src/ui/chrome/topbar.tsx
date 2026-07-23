/** Top bar — brand, segmented tabs, search, and the top-right controls. */
import { cx, el, type InputEl, txt, type T } from '../kit'

export const TopBar = el.attrs({ tag: 'header', css: 'display:flex;flex-direction:row;align-items:center;' }).theme((t: T) => cx(`height:56px;flex:none;display:flex;align-items:center;gap:18px;padding:0 18px;z-index:10;border-bottom:1px solid ${t.border};background:${t.surface};`))

// ── brand ──
export const BrandRow = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme(() => cx('display:flex;align-items:center;gap:11px;min-width:190px;'))
export const BrandMark = el.attrs({ tag: 'div', css: 'display:flex;align-items:center;justify-content:center;' }).theme((t: T) => cx(`width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:${t.accent};box-shadow:0 4px 12px ${t.accentSoft};`))
export const BrandGlyph = el.attrs({ tag: 'div' }).theme(() => cx('width:13px;height:13px;border-radius:3px;background:#fff;transform:rotate(45deg);'))
export const BrandText = txt.attrs({ tag: 'span' }).theme(() => cx("font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:16px;letter-spacing:-.01em;"))
export const BrandSub = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.08em;color:${t.faint};`))

// ── segmented tabs (used by top bar, canvas zoom, addon tabs) ──
export const Segment = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme((t: T) => cx(`display:flex;gap:2px;padding:3px;border-radius:10px;background:${t.surface2};`))
export const SegBtn = el
  .attrs({ tag: 'button' })
  .theme((t: T) => cx(`font:inherit;font-size:13px;font-weight:600;cursor:pointer;border:none;padding:7px 15px;border-radius:8px;transition:all .12s;color:${t.muted};background:transparent;`))
  .states((t: T) => ({
    active: { color: t.text, backgroundColor: t.bg, boxShadow: '0 1px 3px rgba(15,18,30,.12)' },
    idle: {},
  }))

// ── search ──
export const SearchWrap = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;justify-content:center;' }).theme(() => cx('flex:1;display:flex;justify-content:center;'))
export const SearchInner = el.attrs({ tag: 'div' }).theme(() => cx('position:relative;width:100%;max-width:420px;'))
export const SearchIcon = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`position:absolute;left:13px;top:50%;transform:translateY(-50%);font-size:13px;color:${t.faint};`))
export const SearchInput = el.attrs({ tag: 'input' }).theme((t: T) => cx(`font:inherit;font-size:13px;width:100%;padding:9px 14px 9px 32px;border-radius:9px;outline:none;transition:border-color .12s,box-shadow .12s;border:1px solid ${t.border};background:${t.bg};color:${t.text};&:focus{border-color:${t.accent};box-shadow:0 0 0 3px ${t.accentSoft};}`)) as unknown as InputEl
export const Kbd = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`position:absolute;right:11px;top:50%;transform:translateY(-50%);font-family:'JetBrains Mono',monospace;font-size:10px;padding:1px 6px;border-radius:5px;color:${t.faint};border:1px solid ${t.border};`))

// ── top-right ──
export const RightRow = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;justify-content:flex-end;' }).theme(() => cx('display:flex;align-items:center;gap:10px;min-width:190px;justify-content:flex-end;'))
export const IconButton = el.attrs({ tag: 'button', css: 'display:flex;align-items:center;justify-content:center;' }).theme((t: T) => cx(`font:inherit;cursor:pointer;width:34px;height:34px;border-radius:9px;font-size:15px;display:flex;align-items:center;justify-content:center;border:1px solid ${t.border};background:${t.bg};color:${t.text};&:hover{border-color:${t.accent};}`))
export const Avatar = el.attrs({ tag: 'div', css: 'display:flex;align-items:center;justify-content:center;' }).theme((t: T) => cx(`width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;font-family:'Space Grotesk',sans-serif;background:linear-gradient(135deg,${t.accent},${t.accent2});`))
