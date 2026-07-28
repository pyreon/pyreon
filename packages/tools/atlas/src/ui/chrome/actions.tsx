/** Actions addon — an interaction/event log for the previewed component. */
import { el, txt, type T } from '../kit'

export const ActionsHead = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;justify-content:space-between;' }).theme(() => ({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }))
export const ActionsHint = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontSize: '12px', color: `${t.muted}` }))
export const ClearBtn = el.attrs({ tag: 'button' }).theme((t: T) => ({ font: 'inherit', fontSize: '11.5px', cursor: 'pointer', padding: '4px 10px', borderRadius: '7px', border: `1px solid ${t.border}`, background: `${t.bg}`, color: `${t.text}`, hover: { borderColor: `${t.accent}` } }))
export const ActionsEmpty = el.attrs({ tag: 'div' }).theme((t: T) => ({ textAlign: 'center', padding: '40px 12px', fontSize: '13px', borderRadius: '12px', color: `${t.faint}`, border: `1px dashed ${t.border}` }))
export const ActionRow = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme((t: T) => ({ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 11px', borderRadius: '9px', marginBottom: '6px', background: `${t.surface2}`, extendCss: 'animation:atlas-in .18s;' }))
export const ActionName = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: '\'JetBrains Mono\',monospace', fontSize: '11px', fontWeight: '600', color: `${t.accent}` }))
export const ActionDetail = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontSize: '12px', flex: '1', color: `${t.muted}` }))
export const ActionTime = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: '\'JetBrains Mono\',monospace', fontSize: '10px', color: `${t.faint}` }))
