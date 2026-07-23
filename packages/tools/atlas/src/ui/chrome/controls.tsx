/** Addon panel shell + the Controls widgets (text / enum / bool / range / swatch). */
import { cx, el, type InputEl, txt, type T } from '../kit'

export const AddonPanel = el.attrs({ tag: 'section', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme((t: T) => cx(`width:352px;flex:none;display:flex;flex-direction:column;min-height:0;border-left:1px solid ${t.border};background:${t.surface};`))
export const AddonTabs = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme((t: T) => cx(`display:flex;padding:6px 8px;gap:2px;overflow-x:auto;border-bottom:1px solid ${t.border};`))
export const AddonBody = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme(() => cx('flex:1;overflow-y:auto;padding:16px;'))

export const CtrlRow = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme(() => cx('margin-bottom:16px;animation:atlas-in .18s;'))
export const CtrlHead = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;justify-content:space-between;' }).theme(() => cx('display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;'))
export const CtrlLabel = txt.attrs({ tag: 'label' }).theme(() => cx('font-size:12px;font-weight:600;'))
export const CtrlType = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;font-size:10px;color:${t.faint};`))
export const TextInput = el.attrs({ tag: 'input' }).theme((t: T) => cx(`font:inherit;font-size:13px;width:100%;padding:8px 11px;border-radius:8px;outline:none;border:1px solid ${t.border};background:${t.bg};color:${t.text};&:focus{border-color:${t.accent};}`)) as unknown as InputEl
export const EnumWrap = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;flex-wrap:wrap;' }).theme(() => cx('display:flex;flex-wrap:wrap;gap:5px;'))
export const EnumBtn = el
  .attrs({ tag: 'button' })
  .theme((t: T) => cx(`font:inherit;font-size:12px;cursor:pointer;padding:6px 12px;border-radius:7px;text-transform:capitalize;transition:border-color .1s,color .1s;border:1px solid ${t.border};color:${t.muted};background:transparent;&:hover{border-color:${t.accent};color:${t.text};}`))
  .states((t: T) => ({ active: { borderColor: t.accent, color: t.text, backgroundColor: t.accentSoft }, idle: {} }))
export const Switch = el
  .attrs({ tag: 'button' })
  .theme((t: T) => cx(`cursor:pointer;border:none;padding:0;width:42px;height:24px;border-radius:20px;position:relative;transition:background .15s;background:${t.border};`))
  .states((t: T) => ({ on: { backgroundColor: t.accent }, off: {} }))
export const Knob = el
  .attrs({ tag: 'span' })
  .theme(() => cx('position:absolute;top:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:left .15s;left:2px;'))
  .states(() => ({ on: { left: '20px' }, off: {} }))
export const RangeRow = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme(() => cx('display:flex;align-items:center;gap:12px;'))
export const Range = el.attrs({ tag: 'input' }).theme(() => cx('flex:1;')) as unknown as InputEl
export const RangeVal = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;font-size:12px;width:34px;text-align:right;color:${t.muted};`))
export const SwatchWrap = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;flex-wrap:wrap;' }).theme(() => cx('display:flex;flex-wrap:wrap;gap:7px;'))
export const Swatch = el
  .attrs({ tag: 'button' })
  .theme((t: T) => cx(`cursor:pointer;width:26px;height:26px;border-radius:7px;padding:0;border:2px solid ${t.border};`))
  .states((t: T) => ({ active: { borderColor: t.accent }, idle: {} }))
export const ResetBtn = el.attrs({ tag: 'button' }).theme((t: T) => cx(`font:inherit;font-size:12px;cursor:pointer;width:100%;margin-top:4px;padding:9px;border-radius:8px;border:1px dashed ${t.border};background:transparent;color:${t.muted};&:hover{border-color:${t.accent};color:${t.text};}`))
