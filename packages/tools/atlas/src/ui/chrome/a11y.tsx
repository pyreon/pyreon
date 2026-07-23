/** A11y addon — an accessibility report (pass/warn/violation rows). */
import { cx, el, txt, type T } from '../kit'

export const A11ySummary = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme((t: T) => cx(`display:flex;gap:16px;margin-bottom:16px;padding:14px;border-radius:12px;border:1px solid ${t.border};`))
export const A11yStat = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme((t: T) => cx(`display:flex;align-items:center;gap:7px;font-size:12.5px;color:${t.text};`))
export const A11yDot = el
  .attrs({ tag: 'span' })
  .theme((t: T) => cx(`width:9px;height:9px;border-radius:50%;background:${t.ok};`))
  .states((t: T) => ({ ok: { backgroundColor: t.ok }, warn: { backgroundColor: t.warn }, danger: { backgroundColor: t.danger } }))
export const A11yRow = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:flex-start;' }).theme((t: T) => cx(`display:flex;gap:11px;padding:11px 12px;border-radius:10px;margin-bottom:7px;background:${t.surface2};`))
export const A11yIcon = el
  .attrs({ tag: 'span', css: 'display:flex;align-items:center;justify-content:center;' })
  .theme((t: T) => cx(`width:20px;height:20px;flex:none;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;background:${t.ok};`))
  .states((t: T) => ({ ok: { backgroundColor: t.ok }, warn: { backgroundColor: t.warn }, danger: { backgroundColor: t.danger } }))
export const A11yBody = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme(() => cx('flex:1;'))
export const A11yTitle = txt.attrs({ tag: 'div' }).theme(() => cx('font-size:12.5px;font-weight:600;margin-bottom:2px;'))
export const A11yNote = txt.attrs({ tag: 'div' }).theme((t: T) => cx(`font-size:11.5px;line-height:1.45;color:${t.muted};`))
