/** Autodocs view — title, description, preview, props table, usage snippet. */
import { cx, el, txt, type T } from '../kit'

export const DocsWrap = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme((t: T) => ({ flex: '1', overflowY: 'auto', padding: '36px 32px', background: `${t.bg}` }))
export const DocsArticle = el.attrs({ tag: 'article', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme(() => ({ maxWidth: '720px', margin: '0 auto' }))
export const DocsTitleRow = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme(() => ({ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }))
export const DocsTitle = txt.attrs({ tag: 'h1' }).theme(() => cx("font-family:'Space Grotesk',sans-serif;font-size:30px;font-weight:700;margin:0;letter-spacing:-.02em;"))
export const DocsStatus = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontSize: '11px', fontWeight: '700', letterSpacing: '.05em', padding: '3px 9px', borderRadius: '6px', textTransform: 'capitalize', color: `${t.accent}`, background: `${t.accentSoft}` }))
export const DocsDesc = txt.attrs({ tag: 'p' }).theme((t: T) => ({ fontSize: '16px', lineHeight: '1.6', margin: '0 0 26px', maxWidth: '600px', color: `${t.muted}` }))
export const DocsPreview = el.attrs({ tag: 'div', css: 'display:flex;align-items:center;justify-content:center;' }).theme((t: T) => ({ borderRadius: '16px', border: `1px solid ${t.border}`, background: `${t.surface}`, padding: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '26px' }))
export const DocsH2 = txt.attrs({ tag: 'h2' }).theme(() => cx("font-family:'Space Grotesk',sans-serif;font-size:18px;margin:0 0 12px;"))
export const PropsTable = el.attrs({ tag: 'div' }).theme((t: T) => ({ border: `1px solid ${t.border}`, borderRadius: '12px', overflow: 'hidden', marginBottom: '26px' }))
export const PropsHead = el.attrs({ tag: 'div', css: 'display:grid;grid-template-columns:1.4fr 1fr 1fr;column-gap:16px;align-items:center;' }).theme((t: T) => ({ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', columnGap: '16px', padding: '10px 16px', background: `${t.surface2}`, fontSize: '11px', fontWeight: '700', letterSpacing: '.04em', color: `${t.muted}` }))
export const PropsRow = el.attrs({ tag: 'div', css: 'display:grid;grid-template-columns:1.4fr 1fr 1fr;column-gap:16px;align-items:center;' }).theme((t: T) => ({ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', columnGap: '16px', padding: '11px 16px', borderTop: `1px solid ${t.border}`, fontSize: '12.5px', alignItems: 'center' }))
export const HeadCell = txt.attrs({ tag: 'span' }).theme(() => cx(''))
export const PropName = txt.attrs({ tag: 'span' }).theme(() => cx("font-family:'JetBrains Mono',monospace;font-weight:600;"))
export const PropKind = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: '\'JetBrains Mono\',monospace', color: `${t.accent}` }))
export const PropDef = txt.attrs({ tag: 'span' }).theme((t: T) => ({ fontFamily: '\'JetBrains Mono\',monospace', color: `${t.muted}` }))
export const UsagePre = el.attrs({ tag: 'pre' }).theme((t: T) => ({ margin: '0', padding: '18px', borderRadius: '12px', fontFamily: '\'JetBrains Mono\',monospace', fontSize: '13px', lineHeight: '1.6', overflow: 'auto', whiteSpace: 'pre-wrap', background: `${t.codeBg}`, color: `${t.codeFg}` }))
