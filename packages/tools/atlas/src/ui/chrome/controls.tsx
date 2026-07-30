/** Addon panel shell + the Controls widgets (text / enum / bool / range / swatch). */
import { dim, el, type InputEl, txt, type T } from '../kit'

export const AddonPanel = el.attrs({ tag: 'section', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme((t: T) => ({ width: '352px', flex: 'none', display: 'flex', flexDirection: 'column', minHeight: '0', borderLeft: `1px solid ${t.border}`, background: `${t.surface}` }))
export const AddonTabs = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme((t: T) => ({ display: 'flex', padding: '6px 8px', gap: '2px', overflowX: 'auto', borderBottom: `1px solid ${t.border}` }))
export const AddonBody = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme(() => ({ flex: '1', overflowY: 'auto', padding: '16px' }))

export const CtrlRow = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme(() => ({ marginBottom: '16px', extendCss: 'animation:atlas-in .18s;' }))
export const CtrlHead = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;justify-content:space-between;' }).theme(() => ({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '7px' }))
export const CtrlLabel = txt.attrs({ tag: 'label' }).theme(() => ({ fontSize: '12px', fontWeight: '600' }))
export const CtrlType = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: '\'JetBrains Mono\',monospace', fontSize: '10px', color: `${t.faint}` }))
export const TextInput = el.attrs({ tag: 'input' }).theme((t: T) => ({ font: 'inherit', fontSize: '13px', width: '100%', padding: '8px 11px', borderRadius: '8px', outline: 'none', border: `1px solid ${t.border}`, background: `${t.bg}`, color: `${t.text}`, focus: { borderColor: `${t.accent}` } })) as unknown as InputEl
export const EnumWrap = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;flex-wrap:wrap;' }).theme(() => ({ display: 'flex', flexWrap: 'wrap', gap: '5px' }))
export const EnumBtn = el
  .attrs({ tag: 'button' })
  .theme((t: T) => ({ font: 'inherit', fontSize: '12px', cursor: 'pointer', padding: '6px 12px', borderRadius: '7px', textTransform: 'capitalize', transition: 'border-color .1s,color .1s', border: `1px solid ${t.border}`, color: `${t.muted}`, background: 'transparent', hover: { borderColor: `${t.accent}`, color: `${t.text}` } }))
  .states(dim((t) => ({ active: { borderColor: t.accent, color: t.text, backgroundColor: t.accentSoft }, idle: {} })))
export const Switch = el
  .attrs({ tag: 'button' })
  .theme((t: T) => ({ cursor: 'pointer', border: 'none', padding: '0', width: '42px', height: '24px', borderRadius: '20px', position: 'relative', transition: 'background .15s', background: `${t.border}` }))
  .states(dim((t) => ({ on: { backgroundColor: t.accent }, off: {} })))
export const Knob = el
  .attrs({ tag: 'span' })
  .theme(() => ({ position: 'absolute', top: '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left .15s', left: '2px' }))
  .states(() => ({ on: { left: '20px' }, off: {} }))
export const RangeRow = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme(() => ({ display: 'flex', alignItems: 'center', gap: '12px' }))
export const Range = el.attrs({ tag: 'input' }).theme(() => ({ flex: '1' })) as unknown as InputEl
export const RangeVal = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: '\'JetBrains Mono\',monospace', fontSize: '12px', width: '34px', textAlign: 'right', color: `${t.muted}` }))
export const SwatchWrap = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;flex-wrap:wrap;' }).theme(() => ({ display: 'flex', flexWrap: 'wrap', gap: '7px' }))
export const Swatch = el
  .attrs({ tag: 'button' })
  .theme((t: T) => ({ cursor: 'pointer', width: '26px', height: '26px', borderRadius: '7px', padding: '0', border: `2px solid ${t.border}` }))
  .states(dim((t) => ({ active: { borderColor: t.accent }, idle: {} })))
export const ResetBtn = el.attrs({ tag: 'button' }).theme((t: T) => ({ font: 'inherit', fontSize: '12px', cursor: 'pointer', width: '100%', marginTop: '4px', padding: '9px', borderRadius: '8px', border: `1px dashed ${t.border}`, background: 'transparent', color: `${t.muted}`, hover: { borderColor: `${t.accent}`, color: `${t.text}` } }))

/** Number editor — the TextInput look with the native spinner. */
export const NumberInput = el
  .attrs({ tag: 'input', type: 'number' })
  .theme((t: T) => ({ font: 'inherit', fontSize: '13px', width: '100%', padding: '8px 11px', borderRadius: '8px', outline: 'none', border: `1px solid ${t.border}`, background: `${t.bg}`, color: `${t.text}`, focus: { borderColor: `${t.accent}` } })) as unknown as InputEl
/** Native color picker beside its hex readout. */
export const ColorInput = el
  .attrs({ tag: 'input', type: 'color' })
  .theme((t: T) => ({ width: '34px', height: '30px', padding: '0', border: `1px solid ${t.border}`, borderRadius: '7px', background: `${t.bg}`, cursor: 'pointer' })) as unknown as InputEl
export const ColorRow = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme(() => ({ display: 'flex', alignItems: 'center', gap: '9px' }))
export const ColorHex = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: '\'JetBrains Mono\',monospace', fontSize: '11.5px', color: `${t.muted}` }))
