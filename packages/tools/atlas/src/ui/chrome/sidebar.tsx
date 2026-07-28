/** Sidebar — component list grouped by section, with search-empty + footer. */
import { dim, el, txt, type T } from '../kit'

export const Sidebar = el.attrs({ tag: 'aside', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme((t: T) => ({ width: '264px', flex: 'none', display: 'flex', flexDirection: 'column', minHeight: '0', borderRight: `1px solid ${t.border}`, background: `${t.surface}` }))
export const SideHead = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;justify-content:space-between;' }).theme(() => ({ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }))
export const SideLabel = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: '\'JetBrains Mono\',monospace', fontSize: '10px', letterSpacing: '.1em', color: `${t.faint}` }))
export const CountPill = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', color: `${t.muted}`, background: `${t.surface2}` }))
export const SideList = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme(() => ({ flex: '1', overflowY: 'auto', padding: '0 10px 16px' }))
export const GroupLabel = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme((t: T) => ({ margin: '14px 0 5px', padding: '0 8px', fontSize: '11px', fontWeight: '700', letterSpacing: '.02em', display: 'flex', alignItems: 'center', gap: '7px', color: `${t.muted}` }))
export const GroupNum = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: '\'JetBrains Mono\',monospace', fontSize: '10px', color: `${t.accent}` }))
export const CompBtn = el
  .attrs({ tag: 'button', css: 'display:flex;flex-direction:row;align-items:center;' })
  .theme((t: T) => ({ font: 'inherit', cursor: 'pointer', width: '100%', textAlign: 'left', border: 'none', display: 'flex', alignItems: 'center', gap: '11px', padding: '8px 10px', borderRadius: '8px', marginBottom: '1px', fontSize: '13.5px', transition: 'background .1s', fontWeight: '500', color: `${t.muted}`, background: 'transparent', hover: { background: `${t.surface2}` } }))
  .states(dim((t) => ({
    active: { fontWeight: 600, color: t.text, backgroundColor: t.accentSoft },
    idle: {},
  })))
export const CompBar = el
  .attrs({ tag: 'span' })
  .theme((t: T) => ({ width: '3px', height: '15px', borderRadius: '3px', flex: 'none', background: `${t.border}` }))
  .states(dim((t) => ({ active: { backgroundColor: t.accent }, idle: {} })))
export const CompName = txt.attrs({ tag: 'span' }).theme(() => ({ flex: '1' }))
export const NewTag = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontSize: '9px', fontWeight: '700', letterSpacing: '.05em', padding: '2px 6px', borderRadius: '5px', color: `${t.accent}`, background: `${t.accentSoft}` }))
export const SideFoot = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme((t: T) => ({ borderTop: `1px solid ${t.border}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '9px', fontSize: '11.5px', color: `${t.muted}` }))
export const OkDot = el.attrs({ tag: 'span' }).theme((t: T) => ({ width: '8px', height: '8px', borderRadius: '50%', background: `${t.ok}`, boxShadow: `0 0 0 3px ${t.okSoft}` }))
export const Empty = el.attrs({ tag: 'div' }).theme((t: T) => ({ textAlign: 'center', padding: '44px 16px', color: `${t.faint}`, fontFamily: '\'JetBrains Mono\',monospace', fontSize: '12px', lineHeight: '1.6' }))
