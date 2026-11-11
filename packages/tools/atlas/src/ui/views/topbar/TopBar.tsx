/**
 * Top bar view — the catalog toggle (compact only), brand, the view tabs, the
 * ⌘K search TRIGGER (the dialog is the real surface) and the theme toggle.
 *
 * The theme toggle writes the SHARED `pyreon-theme` preference, so the docs,
 * Loom and Atlas agree. It is hidden in `?embed` — the host owns the theme.
 */
import { Show } from '@pyreon/core'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'
import { CatalogIcon, PyreonMark, SearchIcon, ThemeIcon } from '../icons/Icons'

const VIEWS = [
  ['canvas', 'Canvas'],
  ['docs', 'Docs'],
  ['lab', 'Lab'],
] as const

export function TopBar(props: {
  model: WorkbenchModel
  /** The catalog toggle's element, so closing the drawer can return focus. */
  drawerToggleRef?: (el: HTMLElement | null) => void
}) {
  const m = props.model

  // WAI-ARIA tabs: ←/→ move between the views (wrapping), Home/End jump.
  // Activation follows focus — switching a view is cheap and reversible.
  const tabEls: HTMLElement[] = []
  const onTabKey = (e: KeyboardEvent) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(e.key)) return
    e.preventDefault()
    const i = VIEWS.findIndex(([id]) => id === m.view())
    const n = VIEWS.length
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n
    m.view.set(VIEWS[next]![0])
    tabEls[next]?.focus()
  }

  return (
    <C.TopBar>
      <Show when={() => m.compact()}>
        <C.IconButton
          data-testid="toggle-drawer"
          aria-label="Show catalog"
          aria-controls="atlas-catalog-drawer"
          aria-expanded={() => (m.drawerOpen() ? 'true' : 'false')}
          ref={(el: HTMLElement | null) => props.drawerToggleRef?.(el)}
          onClick={() => m.drawerOpen.set(!m.drawerOpen())}
        >
          <CatalogIcon />
        </C.IconButton>
      </Show>

      <C.BrandRow>
        <C.BrandMark>
          <PyreonMark />
        </C.BrandMark>
        <C.BrandText data-testid="brand-title">{m.title}</C.BrandText>
        {m.subtitle ? <C.BrandSub>{m.subtitle}</C.BrandSub> : null}
      </C.BrandRow>

      <C.Segment role="tablist" aria-label="View" onKeyDown={onTabKey}>
        {VIEWS.map(([id, label], i) => (
          <C.SegBtn
            role="tab"
            data-testid={`view-${id}`}
            ref={(el: HTMLElement | null) => {
              if (el) tabEls[i] = el
            }}
            tabIndex={() => (m.view() === id ? 0 : -1)}
            aria-selected={() => (m.view() === id ? 'true' : 'false')}
            state={() => (m.view() === id ? 'active' : 'idle')}
            onClick={() => m.view.set(id)}
          >
            {label}
          </C.SegBtn>
        ))}
      </C.Segment>

      <C.Spacer />

      <C.SearchTrigger
        data-testid="search-trigger"
        aria-label="Search components"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => m.searchOpen.set(true)}
      >
        <SearchIcon />
        <C.SearchTriggerText>Search</C.SearchTriggerText>
        <C.Kbd>⌘K</C.Kbd>
      </C.SearchTrigger>

      {m.embed ? null : (
        <C.IconButton
          data-testid="theme-toggle"
          data-atlas-theme-toggle=""
          aria-label="Toggle light and dark theme"
          title={() => (m.dark() ? 'Switch to light' : 'Switch to dark')}
          onClick={m.toggleTheme}
        >
          <ThemeIcon />
        </C.IconButton>
      )}
    </C.TopBar>
  )
}
