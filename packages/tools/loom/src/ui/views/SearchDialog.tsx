/**
 * The ⌘K search dialog — the atlas shape on loom's chrome. Fulltext over the
 * fabric: package ids, versions, kind, license, FINDINGS (searching
 * `unused-dep` lists every flagged package), and dependency edges both ways.
 * Keyword hits carry the matched field as a chip.
 *
 * The palette owns its OWN query signal. It used to write the model's shared
 * `query`, so every keystroke also re-filtered the sidebar and rebuilt the
 * graph behind the dialog (80-430 ms per key, and the background emptied
 * while you typed). A palette is a lookup, not a filter.
 *
 * Results are capped at `MAX_ROWS` rendered rows: opening on an empty query
 * used to mount a styled row for every node (300+).
 */
import { onMount, Show } from '@pyreon/core'
import { batch, computed, signal } from '@pyreon/reactivity'
import * as C from '../chrome'
import { shortName, type ObservatoryModel } from '../model'

const MAX_ROWS = 50

export function SearchDialog(props: {
  model: ObservatoryModel
  /** `ref` for the field so the ⌘K handler can (re)focus it. */
  fieldRef: (el: HTMLInputElement | null) => void
  focusField: () => void
}) {
  const m = props.model
  const close = () => m.searchOpen.set(false)

  // Body mounts fresh on every open, so its query + cursor start clean.
  const Body = () => {
    const query = signal('')
    const activeIdx = signal(0)
    const allHits = computed(() => m.searchHits(query()))
    const results = computed(() => allHits().slice(0, MAX_ROWS))

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

    let listEl: HTMLElement | null = null
    onMount(() => {
      requestAnimationFrame(() => props.focusField())
      // Arrowing past the visible rows keeps the cursor in view.
      return activeIdx.subscribe(() => {
        listEl?.querySelector(`[data-idx="${activeIdx()}"]`)?.scrollIntoView({ block: 'nearest' })
      })
    })
    return (
      <C.SearchDialogCard data-testid="search-dialog" onClick={(e: Event) => e.stopPropagation()}>
        <C.SearchDialogHead>
          <C.SearchGlyph>⌕</C.SearchGlyph>
          <C.SearchDialogField
            ref={props.fieldRef}
            data-testid="loom-search"
            data-lm-noring=""
            aria-label="Search packages, findings, versions"
            placeholder="Search packages, findings, versions…"
            value={() => query()}
            onInput={(e: Event) =>
              batch(() => {
                query.set((e.target as HTMLInputElement).value)
                activeIdx.set(0)
              })
            }
            onKeyDown={onKey}
          />
          <C.SearchKbd>esc</C.SearchKbd>
        </C.SearchDialogHead>
        <C.SearchResults
          ref={(el: HTMLElement | null) => {
            listEl = el
          }}
        >
          {() =>
            results().map((hit, i) => (
              <C.SearchRow
                data-idx={String(i)}
                state={() => (activeIdx() === i ? 'active' : 'idle')}
                onClick={() => select(hit.id)}
                onMouseEnter={() => activeIdx.set(i)}
              >
                <C.SearchRowName title={hit.id}>
                  {hit.kind === 'internal' ? shortName(hit.id) : hit.id}
                </C.SearchRowName>
                <C.SearchRowKind variant={hit.kind}>{hit.kind}</C.SearchRowKind>
                {hit.reason ? <C.SearchRowReason>{hit.reason}</C.SearchRowReason> : null}
                <Show when={() => activeIdx() === i}>
                  <C.SearchEnterHint>↵</C.SearchEnterHint>
                </Show>
              </C.SearchRow>
            ))
          }
          <Show when={() => allHits().length > MAX_ROWS}>
            <C.SearchMore>
              {() => `+ ${allHits().length - MAX_ROWS} more — keep typing to narrow`}
            </C.SearchMore>
          </Show>
        </C.SearchResults>
        <Show when={() => results().length === 0}>
          <C.SearchEmpty>{() => `Nothing in the fabric matches “${query()}”.`}</C.SearchEmpty>
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
