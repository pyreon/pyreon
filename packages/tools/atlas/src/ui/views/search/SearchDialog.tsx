/**
 * The ⌘K search dialog — docs-site style (zero-content's Search precedent):
 * dim blurred backdrop, centered card, one big input, keyboard-driven results
 * (↑↓ + Enter), Escape/backdrop closes. The top bar only renders the TRIGGER;
 * this is the real search surface.
 */
import { onMount, Show } from '@pyreon/core'
import { batch, computed, signal } from '@pyreon/reactivity'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'

export function SearchDialog(props: { model: WorkbenchModel }) {
  const m = props.model
  const activeIdx = signal(0)
  const results = computed(() => m.search(m.query()))

  const close = () =>
    batch(() => {
      m.searchOpen.set(false)
      m.query.set('')
      activeIdx.set(0)
    })
  const select = (id: string) =>
    batch(() => {
      m.selId.set(id)
      m.view.set('canvas')
      close()
    })
  const nameOf = (id: string) => m.catalog.components.find((c) => c.id === id)?.name ?? id

  const onKey = (e: KeyboardEvent) => {
    const ids = results()
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!ids.length) return
      const delta = e.key === 'ArrowDown' ? 1 : -1
      activeIdx.set((activeIdx() + delta + ids.length) % ids.length)
      return
    }
    if (e.key === 'Enter') {
      const id = ids[activeIdx()]
      if (id) select(id)
    }
  }

  // Mounted only while open (the <Show> below) — focus the field on open.
  const Body = () => {
    onMount(() => {
      // Post-paint: the field must exist AND the browser must have committed
      // the dialog before focus sticks reliably.
      requestAnimationFrame(() => m.focusSearch())
    })
    return (
      <C.SearchDialogCard data-testid="search-dialog" onClick={(e: Event) => e.stopPropagation()}>
        <C.SearchHead>
          <C.SearchGlyph>⌕</C.SearchGlyph>
          <C.SearchField
            ref={m.searchRef}
            data-search
            placeholder="Search components…"
            value={() => m.query()}
            onInput={(e: Event) =>
              batch(() => {
                m.query.set((e.target as HTMLInputElement).value)
                activeIdx.set(0)
              })
            }
            onKeyDown={onKey}
          />
          <C.Kbd>esc</C.Kbd>
        </C.SearchHead>
        <C.SearchResults>
          {() =>
            results().map((id, i) => (
              <C.SearchRow
                state={() => (activeIdx() === i ? 'active' : 'idle')}
                onClick={() => select(id)}
                onMouseEnter={() => activeIdx.set(i)}
              >
                <C.SearchRowName>{() => nameOf(id)}</C.SearchRowName>
                <C.SearchRowPath>{`components/${id}`}</C.SearchRowPath>
                <Show when={() => activeIdx() === i}>
                  <C.SearchEnterHint>↵</C.SearchEnterHint>
                </Show>
              </C.SearchRow>
            ))
          }
        </C.SearchResults>
        <Show when={() => results().length === 0}>
          <C.SearchEmpty>{() => `No components match “${m.query()}”.`}</C.SearchEmpty>
        </Show>
        <C.SearchFoot>
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
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
