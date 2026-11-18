import { createContext } from '@pyreon/core'

/**
 * Which tab of a tab-bar router (`createRouter({ tabs: routerTabs([...]) })`)
 * a subtree belongs to, and the `RouterView` nesting depth reached inside it.
 * Provided by `router.withTab()` and re-provided by each tab-scoped
 * `RouterView` (depth + 1). A tab's views and hooks read THAT tab's stack, so
 * a hidden tab keeps rendering its own page while another tab is active.
 */
export const RouterTabContext = createContext<{ tab: string; depth: number } | null>(null)
