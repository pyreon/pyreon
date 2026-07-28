/** Theme Lab view — the selected component tiled across every theme × mode. */
import { el, txt, type T } from '../kit'

export const LabWrap = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme((t: T) => ({ flex: '1', overflowY: 'auto', padding: '28px 32px', background: `${t.bg}` }))
export const LabGrid = el.attrs({ tag: 'div', css: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));width:100%;' }).theme(() => ({ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '16px', width: '100%', maxWidth: '1100px', margin: '0 auto' }))
export const LabTile = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme((t: T) => ({ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${t.border}`, boxShadow: '0 8px 24px -18px rgba(15,18,30,.4)' }))
export const LabTileHead = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;justify-content:space-between;width:100%;' }).theme((t: T) => ({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: `${t.chrome}`, borderBottom: `1px solid ${t.border}` }))
export const LabTileName = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontSize: '12px', fontWeight: '600', color: `${t.text}` }))
export const LabTileMode = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: '\'JetBrains Mono\',monospace', fontSize: '9.5px', letterSpacing: '.06em', color: `${t.muted}` }))
export const LabTileBody = el.attrs({ tag: 'div', css: 'display:flex;align-items:center;justify-content:center;width:100%;' }).theme((t: T) => ({ padding: '34px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '130px', background: `${t.bg}` }))
