/** Autodocs view — title, description, preview, props table, usage snippet. */
import { cx, el, txt, type T } from '../kit'

export const DocsWrap = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme((t: T) => cx(`flex:1;overflow-y:auto;padding:36px 32px;background:${t.bg};`))
export const DocsArticle = el.attrs({ tag: 'article', css: 'display:flex;flex-direction:column;align-items:stretch;' }).theme(() => cx('max-width:720px;margin:0 auto;'))
export const DocsTitleRow = el.attrs({ tag: 'div', css: 'display:flex;flex-direction:row;align-items:center;' }).theme(() => cx('display:flex;align-items:center;gap:10px;margin-bottom:10px;'))
export const DocsTitle = txt.attrs({ tag: 'h1' }).theme(() => cx("font-family:'Space Grotesk',sans-serif;font-size:30px;font-weight:700;margin:0;letter-spacing:-.02em;"))
export const DocsStatus = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-size:11px;font-weight:700;letter-spacing:.05em;padding:3px 9px;border-radius:6px;text-transform:capitalize;color:${t.accent};background:${t.accentSoft};`))
export const DocsDesc = txt.attrs({ tag: 'p' }).theme((t: T) => cx(`font-size:16px;line-height:1.6;margin:0 0 26px;max-width:600px;color:${t.muted};`))
export const DocsPreview = el.attrs({ tag: 'div', css: 'display:flex;align-items:center;justify-content:center;' }).theme((t: T) => cx(`border-radius:16px;border:1px solid ${t.border};background:${t.surface};padding:48px;display:flex;align-items:center;justify-content:center;margin-bottom:26px;`))
export const DocsH2 = txt.attrs({ tag: 'h2' }).theme(() => cx("font-family:'Space Grotesk',sans-serif;font-size:18px;margin:0 0 12px;"))
export const PropsTable = el.attrs({ tag: 'div' }).theme((t: T) => cx(`border:1px solid ${t.border};border-radius:12px;overflow:hidden;margin-bottom:26px;`))
export const PropsHead = el.attrs({ tag: 'div', css: 'display:grid;grid-template-columns:1.4fr 1fr 1fr;column-gap:16px;align-items:center;' }).theme((t: T) => cx(`display:grid;grid-template-columns:1.4fr 1fr 1fr;column-gap:16px;padding:10px 16px;background:${t.surface2};font-size:11px;font-weight:700;letter-spacing:.04em;color:${t.muted};`))
export const PropsRow = el.attrs({ tag: 'div', css: 'display:grid;grid-template-columns:1.4fr 1fr 1fr;column-gap:16px;align-items:center;' }).theme((t: T) => cx(`display:grid;grid-template-columns:1.4fr 1fr 1fr;column-gap:16px;padding:11px 16px;border-top:1px solid ${t.border};font-size:12.5px;align-items:center;`))
export const HeadCell = txt.attrs({ tag: 'span' }).theme(() => cx(''))
export const PropName = txt.attrs({ tag: 'span' }).theme(() => cx("font-family:'JetBrains Mono',monospace;font-weight:600;"))
export const PropKind = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;color:${t.accent};`))
export const PropDef = txt.attrs({ tag: 'span' }).theme((t: T) => cx(`font-family:'JetBrains Mono',monospace;color:${t.muted};`))
export const UsagePre = el.attrs({ tag: 'pre' }).theme((t: T) => cx(`margin:0;padding:18px;border-radius:12px;font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1.6;overflow:auto;white-space:pre-wrap;background:${t.codeBg};color:${t.codeFg};`))
