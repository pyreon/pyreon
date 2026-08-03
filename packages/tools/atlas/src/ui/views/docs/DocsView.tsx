/**
 * Autodocs view — the six blocks a docs page carries its value in: Title,
 * Description, Primary (the live preview), Controls (props table), Scenarios
 * (every derived state with its verify verdict — each one a LINK that opens
 * the canvas in exactly that state), and Source (fetched over the `atlas dev`
 * channel, with an honest empty state when there is none).
 */
import { signal } from '@pyreon/reactivity'
import * as C from '../../components'
import { callRpc } from '../../lens-client'
import type { WorkbenchModel } from '../../model'

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
        if (ct.type === 'number' && typeof val === 'number') return `${ct.key}={${val}}`
        if (typeof val === 'string' && val) return `${ct.key}="${val}"`
        return ''
      })
      .filter(Boolean)
    return `<${c.name}${attrs.length ? ' ' + attrs.join(' ') : ''} />`
  }

  // Source is fetched LAZILY per component (a docs page that eagerly pulled
  // source for every selection would pay the channel cost for a block most
  // visits never scroll to), and cached per component id for the session.
  const source = signal<string>('')
  const sourceState = signal<'idle' | 'loading' | 'shown' | 'unavailable'>('idle')
  let sourceFor = ''
  const loadSource = async () => {
    const c = m.sel()
    if (!c) return
    if (sourceFor === c.id && sourceState() === 'shown') return
    sourceState.set('loading')
    const res = await callRpc('source', { component: c.name })
    if (res.ok) {
      source.set(String((res.result as { source?: unknown }).source ?? ''))
      sourceFor = c.id
      sourceState.set('shown')
    } else {
      // A workbench served without `atlas dev` has no channel — say what would
      // make the block work rather than rendering a broken pane.
      sourceState.set('unavailable')
    }
  }

  const openScenario = (compId: string, scenarioId: string) => {
    // The scenario entries double as LINKS: jump to the canvas rendering
    // exactly the pinned state the verdict covered. The view flips FIRST —
    // `selectScenario` replaces the value store, which synchronously re-renders
    // this article and unmounts the clicked button; a write sequenced after
    // that teardown is on thin ice, before it is not.
    m.view.set('canvas')
    m.selectScenario(compId, scenarioId)
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
            {/* Only when the catalog SAYS so — defaulting the pill to 'stable'
                asserted a maturity nothing measured. */}
            {c.status ? <C.DocsStatus>{c.status}</C.DocsStatus> : null}
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
          {c.scenarios && c.scenarios.length > 0 ? (
            <>
              <C.DocsH2>Scenarios</C.DocsH2>
              {c.scenarios.map((s) => (
                <C.ScenBtn data-testid={`docs-scenario-${s.id}`} onClick={() => openScenario(c.id, s.id)}>
                  <C.ScenDot variant={s.verdict} data-verdict={s.verdict} />
                  <C.ScenName>{s.name}</C.ScenName>
                  <C.PropKind>{s.verdict}</C.PropKind>
                </C.ScenBtn>
              ))}
            </>
          ) : null}
          <C.DocsH2>Source</C.DocsH2>
          {() => {
            const state = sourceState()
            if (state === 'shown' && sourceFor === c.id) {
              return <C.UsagePre data-testid="docs-source">{() => source()}</C.UsagePre>
            }
            if (state === 'unavailable') {
              return <C.DocsDesc>Source is served by `atlas dev` — start the workbench with it to read files here.</C.DocsDesc>
            }
            return (
              <C.ResetBtn data-testid="docs-source-load" onClick={() => void loadSource()}>
                {state === 'loading' ? 'Loading…' : 'Show source'}
              </C.ResetBtn>
            )
          }}
        </C.DocsArticle>
      </C.DocsWrap>
    )
  }
}
