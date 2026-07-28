/** A11y addon — an accessibility report (pass/warn/violation rows). */
import { dim, el, txt, type T } from '../kit'

export const A11ySummary = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme((t: T) => ({ display: 'flex', gap: '16px', marginBottom: '16px', padding: '14px', borderRadius: '12px', border: `1px solid ${t.border}` }))
export const A11yStat = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme((t: T) => ({ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', color: `${t.text}` }))
export const A11yDot = el
  .attrs({ tag: 'span' })
  .theme((t: T) => ({ width: '9px', height: '9px', borderRadius: '50%', background: `${t.ok}` }))
  .states(dim((t) => ({ ok: { backgroundColor: t.ok }, warn: { backgroundColor: t.warn }, danger: { backgroundColor: t.danger }, unknown: { backgroundColor: t.faint } })))
export const A11yRow = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:flex-start;' }).theme((t: T) => ({ display: 'flex', gap: '11px', padding: '11px 12px', borderRadius: '10px', marginBottom: '7px', background: `${t.surface2}` }))
export const A11yIcon = el
  .attrs({ tag: 'span', css: 'display:flex;align-items:center;justify-content:center;' })
  .theme((t: T) => ({ width: '20px', height: '20px', flex: 'none', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#fff', background: `${t.ok}` }))
  .states(dim((t) => ({ ok: { backgroundColor: t.ok }, warn: { backgroundColor: t.warn }, danger: { backgroundColor: t.danger }, unknown: { backgroundColor: t.faint } })))
export const A11yBody = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme(() => ({ flex: '1' }))
export const A11yTitle = txt.attrs({ tag: 'div' }).theme(() => ({ fontSize: '12.5px', fontWeight: '600', marginBottom: '2px' }))
export const A11yNote = txt.attrs({ tag: 'div' }).theme((t: T) => ({ fontSize: '11.5px', lineHeight: '1.45', color: `${t.muted}` }))
