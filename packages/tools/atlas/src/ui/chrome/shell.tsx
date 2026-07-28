/** Outer frame + status bar + generic layout atoms. */
import { cx, el, txt, type T } from '../kit'

export const Shell = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme((t: T) => ({ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontSize: '14px', background: `${t.bg}`, color: `${t.text}` }))
export const Body = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:stretch;' }).theme(() => ({ flex: '1', minHeight: '0' }))
export const Main = el.attrs({ tag: 'main', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme(() => ({ flex: '1', display: 'flex', flexDirection: 'column', minWidth: '0', minHeight: '0' }))
export const StatusBar = el.attrs({ tag: 'footer' }).theme((t: T) => ({ height: '30px', flex: 'none', display: 'flex', alignItems: 'center', gap: '14px', padding: '0 16px', fontFamily: '\'JetBrains Mono\',monospace', fontSize: '10.5px', borderTop: `1px solid ${t.border}`, background: `${t.surface}`, color: `${t.faint}` }))
export const StatusText = txt.attrs({ tag: 'span' }).theme(() => cx(''))
export const StatusDim = txt.attrs({ tag: 'span' }).theme((t: T) => ({ color: `${t.border}` }))

// generic layout atoms shared across regions
export const Row = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme(() => ({ display: 'flex', alignItems: 'center' }))
export const Spacer = el.attrs({ tag: 'div' }).theme(() => ({ flex: '1' }))
export const Col = el.attrs({ tag: 'div' }).theme(() => ({ display: 'flex', flexDirection: 'column', lineHeight: '1.1' }))
