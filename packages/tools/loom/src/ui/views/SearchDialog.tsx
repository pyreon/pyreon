/**
 * The ⌘K search dialog — the atlas shape on loom's chrome. Fulltext over the
 * fabric: package ids, versions, kind, license, FINDINGS (searching
 * `unused-dep` lists every flagged package), and dependency edges both ways.
 * Keyword hits carry the matched field as a chip.
 */
import { onMount, Show } from '@pyreon/core'
import { batch, computed, signal } from '@pyreon/reactivity'
import * as C from '../chrome'
import { shortName, type ObservatoryModel } from '../model'

export function SearchDialog(props: {
  model: ObservatoryModel
  /** `ref` for the field so the ⌘K handler can (re)focus it. */
  fieldRef: (el: HTMLInputElement | null) => void
  focusField: () => void
}) {
  const m = props.model
  const activeIdx = signal(0)
  const results = computed(() => m.searchHits(m.query()))

  const close = () =>
    batch(() => {
      m.searchOpen.set(false)
      m.query.set('')
      activeIdx.set(0)
    })
  const select = (id: string) =>
    batch(() => {
      m.select(id)
      close()
    })

  const onKey = (e: KeyboardEvent) => {
    const hits = results()
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!hits.length) return
      const delta = e.key === 'ArrowDown' ? 1 : -1
      activeIdx.set((activeIdx() + delta + hits.length) % hits.length)
      return
    }
    if (e.key === 'Enter') {
      const hit = hits[activeIdx()]
      if (hit) select(hit.id)
    }
  }

  const Body = () => {
    onMount(() => {
      requestAnimationFrame(() => props.focusField())
    })
    return (
      <C.SearchDialogCard data-testid="search-dialog" onClick={(e: Event) => e.stopPropagation()}>
        <C.SearchDialogHead>
          <C.SearchGlyph>⌕</C.SearchGlyph>
          <C.SearchDialogField
            ref={props.fieldRef}
            data-testid="loom-search"
            placeholder="Search packages, findings, versions…"
            value={() => m.query()}
            onInput={(e: Event) =>
              batch(() => {
                m.query.set((e.target as HTMLInputElement).value)
                activeIdx.set(0)
              })
            }
            onKeyDown={onKey}
          />
          <C.SearchKbd>esc</C.SearchKbd>
        </C.SearchDialogHead>
        <C.SearchResults>
          {() =>
            results().map((hit, i) => (
              <C.SearchRow
                state={() => (activeIdx() === i ? 'active' : 'idle')}
                onClick={() => select(hit.id)}
                onMouseEnter={() => activeIdx.set(i)}
              >
                <C.SearchRowName>{() => shortName(hit.id)}</C.SearchRowName>
                <C.SearchRowKind variant={hit.kind}>{hit.kind}</C.SearchRowKind>
                {hit.reason ? <C.SearchRowReason>{hit.reason}</C.SearchRowReason> : null}
                <Show when={() => activeIdx() === i}>
                  <C.SearchEnterHint>↵</C.SearchEnterHint>
                </Show>
              </C.SearchRow>
            ))
          }
        </C.SearchResults>
        <Show when={() => results().length === 0}>
          <C.SearchEmpty>{() => `Nothing in the fabric matches “${m.query()}”.`}</C.SearchEmpty>
        </Show>
        <C.SearchFoot>
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
          <span>try: a finding code, a version, a dependency</span>
        </C.SearchFoot>
      </C.SearchDialogCard>
    )
  }

  return (
    <Show when={() => m.searchOpen()}>
      <C.SearchBackdrop onClick={close}>
        <Body />
      </C.SearchBackdrop>
    </Show>
  )
}
