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
 *   window.__PYREON_DEVTOOLS__.enableOverlay()       // Ctrl+Shift+P: hover to inspect components
 *   window.__PYREON_DEVTOOLS__.reactive.activate()   // opt-in: track the live signal/effect graph
 *   window.__PYREON_DEVTOOLS__.reactive.getGraph()   // snapshot of signals/derived/effects + edges
 */

import {
  activateReactiveDevtools,
  deactivateReactiveDevtools,
  defineCrossModuleState,
  getReactiveFires,
  getReactiveGraph,
  type ReactiveFire,
  type ReactiveGraph,
} from '@pyreon/reactivity'

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
  /** Toggle the component inspector overlay (also: Ctrl+Shift+P) */
  enableOverlay(): void
  disableOverlay(): void
  /**
   * Reactive-graph bridge — powers the devtools Signals / Graph / Effects
   * surfaces. Opt-in and zero-cost until `activate()` is called: nothing
   * is tracked while a devtools client is not attached.
   */
  reactive: PyreonReactiveDevtools
}

export interface PyreonReactiveDevtools {
  /** Start tracking the live signal/computed/effect graph. Idempotent. */
  activate(): void
  /** Stop tracking + drop all retained registry/timeline state. */
  deactivate(): void
  /** Fresh snapshot of the reactive graph (nodes + edges). */
  getGraph(): ReactiveGraph
  /** Bounded recent-fire timeline (oldest → newest). */
  getFires(): ReactiveFire[]
}

// ─── Internal registry ────────────────────────────────────────────────────────
//
// Cross-module-instance shared devtools state. The browser-extension hook
// `window.__PYREON_DEVTOOLS__` reads through these — without sharing, a
// component registered by one `@pyreon/runtime-dom` instance would be
// invisible to the extension if the hook was installed by another instance.
interface DevtoolsState {
  components: Map<string, DevtoolsComponentEntry>
  mountListeners: ((entry: DevtoolsComponentEntry) => void)[]
  unmountListeners: ((id: string) => void)[]
  overlayActive: boolean
  overlayEl: HTMLDivElement | null
  tooltipEl: HTMLDivElement | null
  currentHighlight: Element | null
  installed: boolean
}

const _devtoolsState = defineCrossModuleState<DevtoolsState>(
  'pyreon-runtime-dom/devtools-state',
  () => ({
    components: new Map(),
    mountListeners: [],
    unmountListeners: [],
    overlayActive: false,
    overlayEl: null,
    tooltipEl: null,
    currentHighlight: null,
    installed: false,
  }),
)

const _components = _devtoolsState.components
const _mountListeners = _devtoolsState.mountListeners
const _unmountListeners = _devtoolsState.unmountListeners

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

// ─── Component Inspector Overlay ─────────────────────────────────────────────
// State for overlay is in `_devtoolsState` above (shared across module instances).

function findComponentForElement(el: Element): DevtoolsComponentEntry | null {
  // Walk up from the hovered element to find the nearest registered component
  let node: Element | null = el
  while (node) {
    for (const entry of _components.values()) {
      if (entry.el === node) return entry
    }
    node = node.parentElement
  }
  return null
}

function createOverlayElements(): void {
  if (_devtoolsState.overlayEl) return

  _devtoolsState.overlayEl = document.createElement('div')
  _devtoolsState.overlayEl.id = '__pyreon-overlay'
  _devtoolsState.overlayEl.style.cssText =
    'position:fixed;pointer-events:none;border:2px solid #00b4d8;border-radius:3px;z-index:999999;display:none;transition:all 0.08s ease-out;'

  _devtoolsState.tooltipEl = document.createElement('div')
  _devtoolsState.tooltipEl.style.cssText =
    'position:fixed;pointer-events:none;background:#1a1a2e;color:#e0e0e0;font:12px/1.4 ui-monospace,monospace;padding:6px 10px;border-radius:4px;z-index:999999;display:none;box-shadow:0 2px 8px rgba(0,0,0,0.3);max-width:400px;white-space:pre-wrap;'

  document.body.appendChild(_devtoolsState.overlayEl)
  document.body.appendChild(_devtoolsState.tooltipEl)
}

function positionOverlay(rect: DOMRect): void {
  if (!_devtoolsState.overlayEl) return
  _devtoolsState.overlayEl.style.display = 'block'
  _devtoolsState.overlayEl.style.top = `${rect.top}px`
  _devtoolsState.overlayEl.style.left = `${rect.left}px`
  _devtoolsState.overlayEl.style.width = `${rect.width}px`
  _devtoolsState.overlayEl.style.height = `${rect.height}px`
}

function positionTooltip(entry: DevtoolsComponentEntry, rect: DOMRect): void {
  if (!_devtoolsState.tooltipEl) return
  const childCount = entry.childIds.length
  let info = `<${entry.name}>`
  if (childCount > 0) info += `\n  ${childCount} child component${childCount === 1 ? '' : 's'}`
  _devtoolsState.tooltipEl.textContent = info
  _devtoolsState.tooltipEl.style.display = 'block'
  _devtoolsState.tooltipEl.style.top = `${rect.top - 30}px`
  _devtoolsState.tooltipEl.style.left = `${rect.left}px`
  if (rect.top < 35) {
    _devtoolsState.tooltipEl.style.top = `${rect.bottom + 4}px`
  }
}

function hideOverlayElements(): void {
  if (_devtoolsState.overlayEl) _devtoolsState.overlayEl.style.display = 'none'
  if (_devtoolsState.tooltipEl) _devtoolsState.tooltipEl.style.display = 'none'
  _devtoolsState.currentHighlight = null
}

/** @internal — exported for testing only */
export function onOverlayMouseMove(e: MouseEvent): void {
  const target = document.elementFromPoint(e.clientX, e.clientY)
  if (!target || target === _devtoolsState.overlayEl || target === _devtoolsState.tooltipEl) return

  const entry = findComponentForElement(target)
  if (!entry?.el) {
    hideOverlayElements()
    return
  }

  if (entry.el === _devtoolsState.currentHighlight) return
  _devtoolsState.currentHighlight = entry.el

  const rect = entry.el.getBoundingClientRect()
  positionOverlay(rect)
  positionTooltip(entry, rect)
}

/** @internal — exported for testing only */
export function onOverlayClick(e: MouseEvent): void {
  e.preventDefault()
  e.stopPropagation()
  const target = document.elementFromPoint(e.clientX, e.clientY)
  if (!target) return
  const entry = findComponentForElement(target)
  if (entry) {
    console.group(`[Pyreon] <${entry.name}>`)
    console.log('element:', entry.el)
    console.log('children:', entry.childIds.length)
    if (entry.parentId) {
      const parent = _components.get(entry.parentId)
      if (parent) {
        console.log('parent:', `<${parent.name}>`)
      }
    }
    console.groupEnd()
  }
  disableOverlay()
}

function onOverlayKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    disableOverlay()
  }
}

function enableOverlay(): void {
  if (_devtoolsState.overlayActive) return
  _devtoolsState.overlayActive = true
  createOverlayElements()
  document.addEventListener('mousemove', onOverlayMouseMove, true)
  document.addEventListener('click', onOverlayClick, true)
  document.addEventListener('keydown', onOverlayKeydown, true)
  document.body.style.cursor = 'crosshair'
}

function disableOverlay(): void {
  if (!_devtoolsState.overlayActive) return
  _devtoolsState.overlayActive = false
  document.removeEventListener('mousemove', onOverlayMouseMove, true)
  document.removeEventListener('click', onOverlayClick, true)
  document.removeEventListener('keydown', onOverlayKeydown, true)
  document.body.style.cursor = ''
  if (_devtoolsState.overlayEl) _devtoolsState.overlayEl.style.display = 'none'
  if (_devtoolsState.tooltipEl) _devtoolsState.tooltipEl.style.display = 'none'
  _devtoolsState.currentHighlight = null
}

// ─── Installation ─────────────────────────────────────────────────────────────
// `installed` is in `_devtoolsState` above (cross-module-instance shared).

// Resolved once at module load — avoids per-call typeof branch in coverage
const _hasWindow = typeof window !== 'undefined'

export function installDevTools(): void {
  if (!_hasWindow || _devtoolsState.installed) return
  _devtoolsState.installed = true

  const devtools: PyreonDevtools = {
    version: '0.1.0',

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
      el.style.outline = '2px solid #00b4d8'
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

    enableOverlay,
    disableOverlay,

    reactive: {
      activate: activateReactiveDevtools,
      deactivate: deactivateReactiveDevtools,
      getGraph: getReactiveGraph,
      getFires: getReactiveFires,
    },
  }

  // Attach to window — compatible with browser devtools extensions
  ;(window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ = devtools

  // Ctrl+Shift+P toggles the component inspector overlay
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'P') {
      e.preventDefault()
      if (_devtoolsState.overlayActive) disableOverlay()
      else enableOverlay()
    }
  })

  // ── $p console helper ────────────────────────────────────────────────────
  // Type `$p` in the browser console for quick access to Pyreon debug tools.
  const win = window as unknown as Record<string, unknown>
  win.$p = {
    /** List all mounted components */
    components: () => devtools.getAllComponents(),
    /** Component tree (roots only) */
    tree: () => devtools.getComponentTree(),
    /** Highlight a component by id */
    highlight: (id: string) => devtools.highlight(id),
    /** Toggle component inspector overlay */
    inspect: () => {
      if (_devtoolsState.overlayActive) disableOverlay()
      else enableOverlay()
    },
    /** Print component count */
    stats: () => {
      const all = devtools.getAllComponents()
      const roots = devtools.getComponentTree()
      console.log(
        `[Pyreon] ${all.length} component${all.length === 1 ? '' : 's'}, ${roots.length} root${roots.length === 1 ? '' : 's'}`,
      )
      return { total: all.length, roots: roots.length }
    },
    /** Quick help */
    help: () => {
      console.log(
        '[Pyreon] $p commands:\n' +
          '  $p.components() — list all mounted components\n' +
          '  $p.tree()       — component tree (roots only)\n' +
          '  $p.highlight(id)— outline a component\n' +
          '  $p.inspect()    — toggle component inspector\n' +
          '  $p.stats()      — print component count\n' +
          '  $p.help()       — this message',
      )
    },
  }
}
