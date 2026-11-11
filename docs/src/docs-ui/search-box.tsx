import { onMount, Portal } from '@pyreon/core'
import { useEventListener } from '@pyreon/hooks'
import { hideSearch, SearchButton, SearchDialogModule, searchKeyAction, searchOpen, showSearch } from './search'

/**
 * The sidebar's search box (an island, `DocsSearchIsland`), and the owner of
 * search on the page: the keyboard shortcut and the dialog, which renders
 * into `<body>` so it shows even where the sidebar is hidden (below 960px the
 * drawer opens search through `showSearch()`).
 */
export default function DocsSearchBox() {
  let button: HTMLButtonElement | null = null
  // Marks the shortcut and the button as live (the server HTML shows the button before).
  onMount(() => {
    button?.setAttribute('data-hydrated', '')
    return undefined
  })
  useEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null
    const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
    const action = searchKeyAction(e, typing, searchOpen.peek())
    if (action === null) return
    e.preventDefault()
    if (action === 'toggle' && searchOpen.peek()) hideSearch()
    else showSearch()
  })
  return (
    <>
      <SearchButton
        onOpen={showSearch}
        buttonRef={(el) => {
          button = el
        }}
      />
      {() => {
        const D = SearchDialogModule()
        return D ? (
          <Portal target={document.body}>
            <D open={() => searchOpen()} onClose={hideSearch} />
          </Portal>
        ) : null
      }}
    </>
  )
}
