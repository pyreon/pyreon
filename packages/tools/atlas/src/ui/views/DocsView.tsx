/** Autodocs view — generated usage snippet + props table for the selection. */
import * as C from '../chrome'
import type { WorkbenchModel } from '../model'

export function DocsView(props: { model: WorkbenchModel }) {
  const m = props.model
  const usage = () => {
    const c = m.sel()
    if (!c) return ''
    const v = m.vals()
    const attrs = c.controls
      .map((ct) => {
        const val = v[ct.key]
        if (ct.type === 'bool') return val ? ct.key : ''
        if (typeof val === 'string' && val) return `${ct.key}="${val}"`
        return ''
      })
      .filter(Boolean)
    return `<${c.name}${attrs.length ? ' ' + attrs.join(' ') : ''} />`
  }

  // Reactive return — re-renders when the selection or its control values change.
  return () => {
    const c = m.sel()
    if (!c) return null
    return (
      <C.DocsWrap>
        <C.DocsArticle>
          <C.DocsTitleRow>
            <C.DocsTitle>{c.name}</C.DocsTitle>
            <C.DocsStatus>{c.status ?? 'stable'}</C.DocsStatus>
          </C.DocsTitleRow>
          <C.DocsDesc>{c.desc ?? ''}</C.DocsDesc>
          <C.DocsPreview>{() => m.preview()}</C.DocsPreview>
          <C.DocsH2>Props</C.DocsH2>
          <C.PropsTable data-testid="props-table">
            <C.PropsHead>
              <C.HeadCell>NAME</C.HeadCell>
              <C.HeadCell>TYPE</C.HeadCell>
              <C.HeadCell>DEFAULT</C.HeadCell>
            </C.PropsHead>
            {c.controls.map((ct) => (
              <C.PropsRow>
                <C.PropName>{ct.key}</C.PropName>
                <C.PropKind>{ct.type}</C.PropKind>
                <C.PropDef>{String(ct.default)}</C.PropDef>
              </C.PropsRow>
            ))}
          </C.PropsTable>
          <C.DocsH2>Usage</C.DocsH2>
          <C.UsagePre>{() => usage()}</C.UsagePre>
        </C.DocsArticle>
      </C.DocsWrap>
    )
  }
}
