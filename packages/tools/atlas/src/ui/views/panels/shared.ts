/**
 * Shared plumbing for the built-in panels: the tab-metadata resolver. Title +
 * hint come from `ADDON_TABS`, not from any panel file, so the tab strip's
 * copy has ONE home. A renderer is paired with its entry by id; an id with no
 * entry is a programming error worth failing loudly on rather than rendering
 * a blank tab.
 */
import { ADDON_TABS } from '../../addons'

export function tab(id: string): { id: string; title: string; hint: string } {
  const found = ADDON_TABS.find((t) => t.id === id)
  if (!found) throw new Error(`[Pyreon] atlas: no ADDON_TABS entry for built-in panel "${id}"`)
  return { id: found.id, title: found.title, hint: found.hint }
}
