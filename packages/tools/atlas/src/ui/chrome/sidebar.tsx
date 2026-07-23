/** Sidebar — component list grouped by section, with search-empty + footer. */
import { cx, el, txt, type T } from '../kit'

export const Sidebar = el.attrs({ tag: 'aside', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme((t: T) => cx(`width:264px;flex:none;display:flex;flex-direction:column;min-height:0;border-right:1px solid ${t.border};background:${t.surface};`))
export const SideHead = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;justify-content:space-between;' }).theme(() => cx('padding:14px 16px 10px;display:flex;align-items:center;justify-content:space-between;'))
export const SideLabel = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;color:${t.faint};`))
export const CountPill = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-size:11px;padding:2px 8px;border-radius:20px;color:${t.muted};background:${t.surface2};`))
export const SideList = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme(() => cx('flex:1;overflow-y:auto;padding:0 10px 16px;'))
export const GroupLabel = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme((t: T) => cx(`margin:14px 0 5px;padding:0 8px;font-size:11px;font-weight:700;letter-spacing:.02em;display:flex;align-items:center;gap:7px;color:${t.muted};`))
export const GroupNum = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;font-size:10px;color:${t.accent};`))
export const CompBtn = el
  .attrs({ tag: 'button', css: 'display:flex;flex-direction:row;align-items:center;' })
  .theme((t: T) => cx(`font:inherit;cursor:pointer;width:100%;text-align:left;border:none;display:flex;align-items:center;gap:11px;padding:8px 10px;border-radius:8px;margin-bottom:1px;font-size:13.5px;transition:background .1s;font-weight:500;color:${t.muted};background:transparent;&:hover{background:${t.surface2};}`))
  .states((t: T) => ({
    active: { fontWeight: 600, color: t.text, backgroundColor: t.accentSoft },
    idle: {},
  }))
export const CompBar = el
  .attrs({ tag: 'span' })
  .theme((t: T) => cx(`width:3px;height:15px;border-radius:3px;flex:none;background:${t.border};`))
  .states((t: T) => ({ active: { backgroundColor: t.accent }, idle: {} }))
export const CompName = txt.attrs({ tag: 'span' }).theme(() => cx('flex:1;'))
export const NewTag = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-size:9px;font-weight:700;letter-spacing:.05em;padding:2px 6px;border-radius:5px;color:${t.accent};background:${t.accentSoft};`))
export const SideFoot = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme((t: T) => cx(`border-top:1px solid ${t.border};padding:12px 16px;display:flex;align-items:center;gap:9px;font-size:11.5px;color:${t.muted};`))
export const OkDot = el.attrs({ tag: 'span' }).theme((t: T) => cx(`width:8px;height:8px;border-radius:50%;background:${t.ok};box-shadow:0 0 0 3px ${t.okSoft};`))
export const Empty = el.attrs({ tag: 'div' }).theme((t: T) => cx(`text-align:center;padding:44px 16px;color:${t.faint};font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.6;`))
