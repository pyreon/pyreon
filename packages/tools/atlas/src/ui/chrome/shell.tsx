/** Outer frame + status bar + generic layout atoms. */
import { cx, el, txt, type T } from '../kit'

export const Shell = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme((t: T) => cx(`height:100vh;display:flex;flex-direction:column;overflow:hidden;font-size:14px;background:${t.bg};color:${t.text};`))
export const Body = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:stretch;' }).theme(() => cx('flex:1;min-height:0;'))
export const Main = el.attrs({ tag: 'main', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme(() => cx('flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;'))
export const StatusBar = el.attrs({ tag: 'footer' }).theme((t: T) => cx(`height:30px;flex:none;display:flex;align-items:center;gap:14px;padding:0 16px;font-family:'JetBrains Mono',monospace;font-size:10.5px;border-top:1px solid ${t.border};background:${t.surface};color:${t.faint};`))
export const StatusText = txt.attrs({ tag: 'span' }).theme(() => cx(''))
export const StatusDim = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`color:${t.border};`))

// generic layout atoms shared across regions
export const Row = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme(() => cx('display:flex;align-items:center;'))
export const Spacer = el.attrs({ tag: 'div' }).theme(() => cx('flex:1;'))
export const Col = el.attrs({ tag: 'div' }).theme(() => cx('display:flex;flex-direction:column;line-height:1.1;'))
