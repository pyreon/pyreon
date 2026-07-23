/** Theme Lab view — the selected component tiled across every theme × mode. */
import { cx, el, txt, type T } from '../kit'

export const LabWrap = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme((t: T) => cx(`flex:1;overflow-y:auto;padding:28px 32px;background:${t.bg};`))
export const LabGrid = el.attrs({ tag: 'div', css: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));width:100%;' }).theme(() => cx('display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;width:100%;max-width:1100px;margin:0 auto;'))
export const LabTile = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme((t: T) => cx(`border-radius:14px;overflow:hidden;border:1px solid ${t.border};box-shadow:0 8px 24px -18px rgba(15,18,30,.4);`))
export const LabTileHead = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;justify-content:space-between;width:100%;' }).theme((t: T) => cx(`display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:${t.chrome};border-bottom:1px solid ${t.border};`))
export const LabTileName = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-size:12px;font-weight:600;color:${t.text};`))
export const LabTileMode = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.06em;color:${t.muted};`))
export const LabTileBody = el.attrs({ tag: 'div', css: 'display:flex;align-items:center;justify-content:center;width:100%;' }).theme((t: T) => cx(`padding:34px 20px;display:flex;align-items:center;justify-content:center;min-height:130px;background:${t.bg};`))
