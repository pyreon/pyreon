/**
 * The addon-panel registry — `panel id → renderer`.
 *
 * Why this exists. `ADDON_TABS` made the tab STRIP data-driven, but the tab
 * BODIES were a hand-written `<Show when={() => m.addon() === '…'}>` chain in
 * `views/AddonPanel.tsx`, over a closed `AddonTabId` union. So "add a panel"
 * meant editing the shell, and a plugin could not contribute one at all.
 *
 * That gap is the architecture prerequisite in #2517: the pipeline plugins run
 * under `atlas scan` in Node and must stay DOM-free, so they cannot carry a
 * renderer. The seam is a UI-side map — a pipeline plugin declares THAT it has
 * a panel (by name), and the UI package supplies the renderer under the same
 * name. `atlas scan` keeps running in Node, the DOM stays out of the plugin
 * contract, and third-party panels become possible.
 *
 * On the module-level mutable registry (anti-patterns "Memory Leak Classes",
 * the three questions before adding one):
 *
 *   1. eviction trigger — `unregisterAddonPanel(id)`, plus `resetAddonPanels()`
 *      which restores exactly the built-ins. Tests use the latter so state
 *      cannot leak between cases.
 *   2. cleanup contract — keyed by id, LAST-WRITE-WINS with a dev warning. Not
 *      positional, so removal order never matters (leak class A).
 *   3. bounded — one entry per panel id. It is a registry of UI tabs, not a
 *      per-item cache; it cannot grow with data.
 */
import type { VNode } from '@pyreon/core'

/**
 * A panel's renderer receives the workbench model. Typed as `unknown` here on
 * purpose: `model.ts` imports `./addons` (for the id union), so importing
 * `WorkbenchModel` back into this module would close a cycle. Panels cast to
 * `WorkbenchModel` at their own top, which is a one-line cost paid four times
 * versus a package-level import cycle.
 */
export type AddonPanelRender = (model: unknown) => VNode

export interface AddonPanelDef {
  /**
   * Open `string`, not the built-in `AddonTabId` union — a plugin's panel id is
   * not knowable at compile time, and a closed union here would make the
   * registry unusable from outside this package.
   */
  id: string
  title: string
  /** One-line explanation of what the tab is for. */
  hint: string
  /**
   * Renders the tab BODY. Returns a single `VNode` (a fragment counts), which
   * keeps it out of the accessor arm of `VNodeChild` — the panel is already
   * mounted lazily by the `<Show>` around it, so a second layer of laziness
   * would just be a nested accessor the renderer cannot mount.
   */
  render: AddonPanelRender
}

/**
 * Insertion-ordered — a `Map` keeps registration order, which IS tab order, so
 * a late-registered plugin panel lands after the built-ins rather than in an
 * arbitrary spot.
 */
const registry = new Map<string, AddonPanelDef>()

/** The built-ins, captured once so `resetAddonPanels` has a definition to restore to. */
let builtins: readonly AddonPanelDef[] = []

/**
 * Register a panel. Called once per built-in at UI module load, and by anyone
 * contributing a panel for a pipeline plugin (use the plugin's name as the id,
 * so the two sides are obviously the same feature).
 *
 * Re-registering an id REPLACES it — that is what makes a consumer able to
 * override a built-in panel — but it warns in dev, because the overwhelmingly
 * more likely cause is two panels accidentally sharing a name.
 */
export function registerAddonPanel(def: AddonPanelDef): void {
  if (process.env.NODE_ENV !== 'production' && registry.has(def.id)) {
    console.warn(
      `[Pyreon] atlas: addon panel "${def.id}" is already registered — the later registration wins. ` +
        `If this was not an intentional override, give one of them a different id.`,
    )
  }
  registry.set(def.id, def)
}

/** Remove a panel by id. Idempotent; returns whether anything was removed. */
export function unregisterAddonPanel(id: string): boolean {
  return registry.delete(id)
}

/** Every registered panel, in registration order. */
export function getAddonPanels(): readonly AddonPanelDef[] {
  return [...registry.values()]
}

/** One panel by id, or `undefined`. */
export function getAddonPanel(id: string): AddonPanelDef | undefined {
  return registry.get(id)
}

/**
 * Record the current set as the built-in baseline. Called once by the UI after
 * it registers its own panels; calling it again is a no-op, so a consumer
 * cannot accidentally bake their own panel into the baseline and make
 * `resetAddonPanels` un-resettable.
 */
export function sealAddonPanels(): void {
  if (builtins.length === 0) builtins = [...registry.values()]
}

/**
 * Restore exactly the built-ins. The eviction trigger for the registry — tests
 * call it so a registration in one case cannot bleed into the next.
 */
export function resetAddonPanels(): void {
  registry.clear()
  for (const def of builtins) registry.set(def.id, def)
}
