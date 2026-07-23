/** Canvas view — the toolbar, the dotted stage, and the zoomable preview frame. */
import { cx, el, txt, type T } from '../kit'

export const CanvasBar = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme((t: T) => cx(`height:52px;flex:none;display:flex;align-items:center;gap:14px;padding:0 16px;border-bottom:1px solid ${t.border};background:${t.surface};`))
export const CanvasName = txt.attrs({ tag: 'span' }).theme(() => cx("font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:15px;"))
export const CanvasPath = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;font-size:10px;color:${t.faint};`))
export const ZoomLabel = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;font-size:11px;width:42px;text-align:center;color:${t.muted};`))
export const ZoomBtn = el.attrs({ tag: 'button' }).theme((t: T) => cx(`font:inherit;cursor:pointer;border:none;background:transparent;width:26px;height:26px;border-radius:6px;font-size:15px;color:${t.text};&:hover{background:${t.surface2};}`))
export const Stage = el.attrs({ tag: 'div', css: 'display:flex;align-items:center;justify-content:center;' }).theme((t: T) => cx(`flex:1;min-height:0;overflow:auto;display:flex;align-items:center;justify-content:center;padding:40px;background-color:${t.bg};background-image:radial-gradient(${t.dotColor} 1px,transparent 1px);background-size:22px 22px;`))
export const Frame = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme((t: T) => cx(`border-radius:16px;overflow:hidden;box-shadow:0 20px 50px -24px rgba(15,18,30,.35);border:1px solid ${t.border};background:${t.surface};`))
export const FrameChrome = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;justify-content:space-between;' }).theme((t: T) => cx(`display:flex;align-items:center;justify-content:space-between;padding:9px 14px;border-bottom:1px solid ${t.border};background:${t.chrome};font-family:'JetBrains Mono',monospace;font-size:10px;color:${t.muted};`))
export const PreviewSurface = el
  .attrs({ tag: 'div', css: 'display:flex;align-items:center;justify-content:center;' })
  .theme(() => cx('padding:56px 40px;display:flex;align-items:center;justify-content:center;min-height:220px;transition:transform .12s ease;transform-origin:center;'))
  .sizes(() => ({
    z50: { transform: 'scale(.5)' },
    z75: { transform: 'scale(.75)' },
    z100: { transform: 'scale(1)' },
    z125: { transform: 'scale(1.25)' },
    z150: { transform: 'scale(1.5)' },
    z175: { transform: 'scale(1.75)' },
    z200: { transform: 'scale(2)' },
  }))
