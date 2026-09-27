/* oxlint-disable jsx-a11y/prefer-tag-over-role -- a styled card with the dialog
   ROLE rather than a native <dialog>: the native element is hidden until
   showModal(), which puts it in the top layer above the workbench's own
   backdrop and focus handling. */
/**
 * The ⌘K search dialog — docs-site style (zero-content's Search precedent):
 * dim blurred backdrop, centered card, one big input, keyboard-driven results
 * (↑↓ + Enter), Escape/backdrop closes. The top bar only renders the TRIGGER;
 * this is the real search surface.
 */
import { onMount, Show } from '@pyreon/core'
import { batch, computed, isClient, signal } from '@pyreon/reactivity'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'

export function SearchDialog(props: { model: WorkbenchModel }) {
  const m = props.model
  const activeIdx = signal(0)
  const results = computed(() => m.searchHits(m.query()))

  // Focus returns to wherever it was when the dialog opened — the ⌘K
  // trigger, a sidebar row — rather than falling to the body.
  let opener: HTMLElement | null = null
  const close = () => {
    batch(() => {
      m.searchOpen.set(false)
      m.query.set('')
      activeIdx.set(0)
    })
    const back = opener
    opener = null
    if (back && typeof back.focus === 'function' && back.isConnected) back.focus()
  }
  const select = (id: string) =>
    batch(() => {
      m.selId.set(id)
      m.view.set('canvas')
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

  // Mounted only while open (the <Show> below) — focus the field on open.
  const Body = () => {
    onMount(() => {
      opener = isClient ? (document.activeElement as HTMLElement | null) : null
      // Post-paint: the field must exist AND the browser must have committed
      // the dialog before focus sticks reliably.
      requestAnimationFrame(() => m.focusSearch())
    })
    return (
      <C.SearchDialogCard
        data-testid="search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Search components"
        onClick={(e: Event) => e.stopPropagation()}
      >
        <C.SearchHead>
          <C.SearchGlyph>⌕</C.SearchGlyph>
          <C.SearchField
            ref={m.searchRef}
            data-search
            aria-label="Search components"
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
          <C.SearchEsc>esc</C.SearchEsc>
        </C.SearchHead>
        <C.SearchResults>
          {() =>
            results().map((hit, i) => (
              <C.SearchRow
                state={() => (activeIdx() === i ? 'active' : 'idle')}
                onClick={() => select(hit.id)}
                onMouseEnter={() => activeIdx.set(i)}
              >
                <C.SearchRowName>{hit.name}</C.SearchRowName>
                <C.SearchRowPath>{`components/${hit.id}`}</C.SearchRowPath>
                {hit.reason ? <C.SearchRowReason>{hit.reason}</C.SearchRowReason> : null}
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
