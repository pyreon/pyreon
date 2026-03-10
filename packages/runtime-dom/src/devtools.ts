/**
 * Pyreon DevTools — exposes a `__PYREON_DEVTOOLS__` global hook for browser devtools extensions
 * and in-app debugging utilities.
 *
 * Installed automatically on first `mount()` call in the browser.
 * No-op on the server (typeof window === "undefined").
 *
 * Usage:
 *   window.__PYREON_DEVTOOLS__.getComponentTree()    // root component entries
 *   window.__PYREON_DEVTOOLS__.getAllComponents()     // flat list of all live components
 *   window.__PYREON_DEVTOOLS__.highlight("comp-id")  // outline a component's DOM node
 *   window.__PYREON_DEVTOOLS__.onComponentMount(cb)  // subscribe to mount events
 *   window.__PYREON_DEVTOOLS__.onComponentUnmount(cb)// subscribe to unmount events
 */

export interface DevtoolsComponentEntry {
  id: string
  name: string
  /** First DOM element produced by this component, if any */
  el: Element | null
  parentId: string | null
  childIds: string[]
}

export interface PyreonDevtools {
  readonly version: string
  getComponentTree(): DevtoolsComponentEntry[]
  getAllComponents(): DevtoolsComponentEntry[]
  highlight(id: string): void
  onComponentMount(cb: (entry: DevtoolsComponentEntry) => void): () => void
  onComponentUnmount(cb: (id: string) => void): () => void
}

// ─── Internal registry ────────────────────────────────────────────────────────

const _components = new Map<string, DevtoolsComponentEntry>()
const _mountListeners: Array<(entry: DevtoolsComponentEntry) => void> = []
const _unmountListeners: Array<(id: string) => void> = []

export function registerComponent(
  id: string,
  name: string,
  el: Element | null,
  parentId: string | null,
): void {
  const entry: DevtoolsComponentEntry = { id, name, el, parentId, childIds: [] }
  _components.set(id, entry)
  if (parentId) {
    const parent = _components.get(parentId)
    if (parent) parent.childIds.push(id)
  }
  for (const cb of _mountListeners) cb(entry)
}

export function unregisterComponent(id: string): void {
  const entry = _components.get(id)
  if (!entry) return
  if (entry.parentId) {
    const parent = _components.get(entry.parentId)
    if (parent) parent.childIds = parent.childIds.filter((c) => c !== id)
  }
  _components.delete(id)
  for (const cb of _unmountListeners) cb(id)
}

// ─── Installation ─────────────────────────────────────────────────────────────

let _installed = false

export function installDevTools(): void {
  if (typeof window === "undefined" || _installed) return
  _installed = true

  const devtools: PyreonDevtools = {
    version: "0.1.0",

    getComponentTree() {
      return Array.from(_components.values()).filter((e) => e.parentId === null)
    },

    getAllComponents() {
      return Array.from(_components.values())
    },

    highlight(id: string) {
      const entry = _components.get(id)
      if (!entry?.el) return
      const el = entry.el as HTMLElement
      const prev = el.style.outline
      el.style.outline = "2px solid #00b4d8"
      setTimeout(() => {
        el.style.outline = prev
      }, 1500)
    },

    onComponentMount(cb: (entry: DevtoolsComponentEntry) => void): () => void {
      _mountListeners.push(cb)
      return () => {
        const i = _mountListeners.indexOf(cb)
        if (i >= 0) _mountListeners.splice(i, 1)
      }
    },

    onComponentUnmount(cb: (id: string) => void): () => void {
      _unmountListeners.push(cb)
      return () => {
        const i = _unmountListeners.indexOf(cb)
        if (i >= 0) _unmountListeners.splice(i, 1)
      }
    },
  }

  // Attach to window — compatible with browser devtools extensions
  ;(window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ = devtools
}
