/** Actions addon — an interaction/event log for the previewed component. */
import { cx, el, txt, type T } from '../kit'

export const ActionsHead = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;justify-content:space-between;' }).theme(() => cx('display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;'))
export const ActionsHint = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-size:12px;color:${t.muted};`))
export const ClearBtn = el.attrs({ tag: 'button' }).theme((t: T) => cx(`font:inherit;font-size:11.5px;cursor:pointer;padding:4px 10px;border-radius:7px;border:1px solid ${t.border};background:${t.bg};color:${t.text};&:hover{border-color:${t.accent};}`))
export const ActionsEmpty = el.attrs({ tag: 'div' }).theme((t: T) => cx(`text-align:center;padding:40px 12px;font-size:13px;border-radius:12px;color:${t.faint};border:1px dashed ${t.border};`))
export const ActionRow = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme((t: T) => cx(`display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:9px;margin-bottom:6px;animation:atlas-in .18s;background:${t.surface2};`))
export const ActionName = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:${t.accent};`))
export const ActionDetail = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-size:12px;flex:1;color:${t.muted};`))
export const ActionTime = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;font-size:10px;color:${t.faint};`))
