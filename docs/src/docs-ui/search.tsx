import type { ComponentFn } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

type DialogComponent = ComponentFn<{ open: () => boolean; onClose: () => void }>

/**
 * Docs search state, shared by every island on the page that opens search
 * (the sidebar's search box, the drawer's): one module instance in the
 * browser, so one open flag and one dialog. The dialog module
 * (`SearchDialog.tsx`, MiniSearch, the index) loads on the first open.
 */
export const searchOpen = signal(false)
export const SearchDialogModule = signal<DialogComponent | null>(null)
let loading = false

export function showSearch(): void {
  searchOpen.set(true)
  if (SearchDialogModule.peek() !== null || loading) return
  loading = true
  void import('./SearchDialog')
    .then((m) => SearchDialogModule.set(m.default as DialogComponent))
    .catch(() => {
      // A failed chunk (offline, a stale deploy): let the next open retry.
      loading = false
      searchOpen.set(false)
    })
}

export function hideSearch(): void {
  searchOpen.set(false)
}

/** ⌘K / Ctrl+K toggles, "/" opens (outside a text field). Pure; exported for tests. */
export function searchKeyAction(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey'>, typing: boolean, open: boolean): 'toggle' | 'open' | null {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') return 'toggle'
  if (e.key === '/' && !typing && !open) return 'open'
  return null
}

export function SearchButton(props: { onOpen: () => void; id?: string | undefined; buttonRef?: ((el: HTMLButtonElement | null) => void) | undefined }) {
  return (
    <button type="button" class="dx-search" id={props.id} aria-haspopup="dialog" ref={props.buttonRef} onClick={() => props.onOpen()}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
        <path d="M10.5 10.5 14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <span>Search docs</span>
      <kbd aria-hidden="true">⌘K</kbd>
    </button>
  )
}
