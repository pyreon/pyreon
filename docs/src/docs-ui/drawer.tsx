import { onMount, Show } from '@pyreon/core'
import { useMediaQuery, useScrollLock } from '@pyreon/hooks'
import { effect, signal, watch } from '@pyreon/reactivity'
import { trailOf } from './nav'
import { SearchButton, showSearch } from './search'
import { DocsSidebar } from './sidebar'
import { docsLayout } from './tokens'

/** The drawer button's "where am I": group / page. Pure; exported for tests. */
export function drawerWhere(path: string): string {
  const t = trailOf(path)
  if (!t) return 'Docs'
  return t.parent ? `${t.group.group} / ${t.parent.title}` : `${t.group.group} / ${t.item.title}`
}

/**
 * Below 960px the sidebar becomes this drawer (an island, `DocsDrawerIsland`):
 * a full-width "Browse docs" button under the nav (it names the current group
 * / page), opening a modal sheet with search and the same groups. A native
 * modal `<dialog>`: focus moves in, the page behind is inert, Escape closes
 * it; focus then returns to the button and the page scrolls again. Following
 * a link and widening past 960px close it.
 */
export default function DocsDrawer(props: { path: string }) {
  const open = signal(false)
  const scroll = useScrollLock()
  let dialog: HTMLDialogElement | null = null
  let button: HTMLButtonElement | null = null

  const close = () => open.set(false)

  const wide = useMediaQuery(`(min-width: ${docsLayout.drawerBreak}px)`)
  watch(wide, (w) => {
    if (w) close()
  })

  onMount(() => {
    const sync = effect(() => {
      if (!dialog) return
      if (open() && !dialog.open) {
        dialog.showModal()
        scroll.lock()
        dialog.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'center' })
      } else if (!open() && dialog.open) {
        dialog.close()
      }
    })
    return () => {
      sync.dispose()
      scroll.unlock()
    }
  })

  return (
    <>
      <button
        type="button"
        class="dx-drawer-btn"
        aria-haspopup="dialog"
        aria-expanded={() => (open() ? 'true' : 'false')}
        aria-controls="dx-drawer"
        ref={(el: HTMLButtonElement | null) => {
          button = el
        }}
        onClick={() => open.set(true)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        Browse docs
        <span class="dx-drawer-btn__where">{drawerWhere(props.path)}</span>
      </button>
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- pointer-only dismissal on the ::backdrop; the keyboard closes the modal dialog with Escape and its close button */}
      <dialog
        id="dx-drawer"
        class="dx-drawer"
        aria-label="Docs navigation"
        ref={(el: HTMLDialogElement | null) => {
          dialog = el
          // Escape and every other close path end here. A listener, not
          // `onClose`: the JSX types lack it for <dialog> (#4369).
          el?.addEventListener('close', () => {
            open.set(false)
            scroll.unlock()
            button?.focus()
          })
        }}
        onClick={(e: MouseEvent) => {
          if (e.target === dialog) close()
        }}
      >
        <div class="dx-drawer__head">
          <span class="dx-eyebrow">Docs</span>
          <button type="button" class="dx-drawer__close" onClick={close}>
            Close
          </button>
        </div>
        {/* The groups render only while the drawer is open: no second copy of the sidebar in every page's HTML. */}
        <Show when={() => open()}>
          <DocsSidebar
            path={props.path}
            idPrefix="dx-drawer"
            label="Docs, drawer"
            search={
              <SearchButton
                onOpen={() => {
                  close()
                  showSearch()
                }}
              />
            }
            onNavigate={close}
          />
        </Show>
      </dialog>
    </>
  )
}
