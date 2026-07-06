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
  describeReactiveGraph,
  formatUpdateCause,
  type GraphDescription,
  getReactiveFires,
  getReactiveGraph,
  getUpdateCause,
  isClient,
  type ReactiveFire,
  type ReactiveGraph,
  type UpdateCause,
} from '@pyreon/reactivity'

export interface DevtoolsComponentEntry {
  id: string
  name: string
  /**
   * First DOM element produced by this component, if any. Backed by a
   * `WeakRef` internally — reads `null` once the element has been garbage
   * collected. The registry is introspection metadata and must never act as
   * a GC root for DOM: the element is captured ONCE at mount, so if the
   * component's DOM is later replaced by a reactive re-render (while the
   * component itself stays mounted), a strong ref here would pin the
   * detached original subtree for the component's whole lifetime — the
   * heap-snapshot "detached `<div>` retained by `_components`" signature.
   */
  readonly el: Element | null
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
  /** "Why did this update?" — the causal chain that led to a node's last fire. */
  getUpdateCause(nodeId: number): UpdateCause | null
  /** Render an {@link UpdateCause} as a source-anchored trace. */
  formatUpdateCause(cause: UpdateCause): string
  /**
   * Show the zero-install in-app reactive-health overlay (orphan signals,
   * high-fanout hubs, deep chains). Also toggled with `Ctrl+Shift+R`.
   */
  showOverlay(): void
  /** Hide the reactive-health overlay. */
  hideOverlay(): void
}

// ─── Internal registry ────────────────────────────────────────────────────────

const _components = new Map<string, DevtoolsComponentEntry>()
const _mountListeners: ((entry: DevtoolsComponentEntry) => void)[] = []
const _unmountListeners: ((id: string) => void)[] = []

export function registerComponent(
  id: string,
  name: string,
  el: Element | null,
  parentId: string | null,
): void {
  // WeakRef, not a strong ref — see the DevtoolsComponentEntry.el JSDoc.
  const elRef = el ? new WeakRef(el) : null
  const entry: DevtoolsComponentEntry = {
    id,
    name,
    get el() {
      return elRef?.deref() ?? null
    },
    parentId,
    childIds: [],
  }
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

let _overlayActive = false
let _overlayEl: HTMLDivElement | null = null
let _tooltipEl: HTMLDivElement | null = null
let _currentHighlight: Element | null = null

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
  if (_overlayEl) return

  _overlayEl = document.createElement('div')
  _overlayEl.id = '__pyreon-overlay'
  _overlayEl.style.cssText =
    'position:fixed;pointer-events:none;border:2px solid #00b4d8;border-radius:3px;z-index:999999;display:none;transition:all 0.08s ease-out;'

  _tooltipEl = document.createElement('div')
  _tooltipEl.style.cssText =
    'position:fixed;pointer-events:none;background:#1a1a2e;color:#e0e0e0;font:12px/1.4 ui-monospace,monospace;padding:6px 10px;border-radius:4px;z-index:999999;display:none;box-shadow:0 2px 8px rgba(0,0,0,0.3);max-width:400px;white-space:pre-wrap;'

  document.body.appendChild(_overlayEl)
  document.body.appendChild(_tooltipEl)
}

function positionOverlay(rect: DOMRect): void {
  if (!_overlayEl) return
  _overlayEl.style.display = 'block'
  _overlayEl.style.top = `${rect.top}px`
  _overlayEl.style.left = `${rect.left}px`
  _overlayEl.style.width = `${rect.width}px`
  _overlayEl.style.height = `${rect.height}px`
}

function positionTooltip(entry: DevtoolsComponentEntry, rect: DOMRect): void {
  if (!_tooltipEl) return
  const childCount = entry.childIds.length
  let info = `<${entry.name}>`
  if (childCount > 0) info += `\n  ${childCount} child component${childCount === 1 ? '' : 's'}`
  _tooltipEl.textContent = info
  _tooltipEl.style.display = 'block'
  _tooltipEl.style.top = `${rect.top - 30}px`
  _tooltipEl.style.left = `${rect.left}px`
  if (rect.top < 35) {
    _tooltipEl.style.top = `${rect.bottom + 4}px`
  }
}

function hideOverlayElements(): void {
  if (_overlayEl) _overlayEl.style.display = 'none'
  if (_tooltipEl) _tooltipEl.style.display = 'none'
  _currentHighlight = null
}

/** @internal — exported for testing only */
export function onOverlayMouseMove(e: MouseEvent): void {
  const target = document.elementFromPoint(e.clientX, e.clientY)
  if (!target || target === _overlayEl || target === _tooltipEl) return

  const entry = findComponentForElement(target)
  if (!entry?.el) {
    hideOverlayElements()
    return
  }

  if (entry.el === _currentHighlight) return
  _currentHighlight = entry.el

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
  if (_overlayActive) return
  _overlayActive = true
  createOverlayElements()
  document.addEventListener('mousemove', onOverlayMouseMove, true)
  document.addEventListener('click', onOverlayClick, true)
  document.addEventListener('keydown', onOverlayKeydown, true)
  document.body.style.cursor = 'crosshair'
}

function disableOverlay(): void {
  if (!_overlayActive) return
  _overlayActive = false
  document.removeEventListener('mousemove', onOverlayMouseMove, true)
  document.removeEventListener('click', onOverlayClick, true)
  document.removeEventListener('keydown', onOverlayKeydown, true)
  document.body.style.cursor = ''
  if (_overlayEl) _overlayEl.style.display = 'none'
  if (_tooltipEl) _tooltipEl.style.display = 'none'
  _currentHighlight = null
}

// ─── Reactive dev overlay (zero-install in-app dev panel) ────────────────────
// A floating panel with two views:
//   • Health   — orphan signals / high-fanout hubs / deep chains that
//                `describeReactiveGraph` computes ("is my reactivity wired the
//                way I think?").
//   • Activity — the recent reactive fires + a "why did X update?" causal chain
//                (`getReactiveFires` + `getUpdateCause` / `formatUpdateCause`),
//                the inverse of React DevTools' "why did this render?" — it
//                explains a specific value's most recent update from the graph.
// Distinct from the component-inspect overlay above (`enableOverlay`, hover to
// inspect DOM/components) and from the Chrome extension (separate install):
// this is zero-install, mounted by the always-on dev devtools, toggled with
// Ctrl+Shift+R. Reading the graph/fires auto-activates reactive tracking if it
// wasn't already on. Node-oriented (not DOM-click) — see the loop ledger for
// the deferred DOM→node correlation follow-up.

type ReactiveView = 'health' | 'activity'
let _reactivePanelActive = false
let _reactivePanelEl: HTMLDivElement | null = null
let _reactiveView: ReactiveView = 'health'

function reactiveHealthBody(): string {
  // Reading the graph requires tracking to be active; turn it on lazily so the
  // panel works even if the app never called `reactive.activate()`.
  activateReactiveDevtools()
  let desc: GraphDescription
  try {
    desc = describeReactiveGraph(getReactiveGraph())
  } catch {
    return 'Reactive graph unavailable.'
  }
  const s = desc.summary
  const header =
    `${s.signals} signal${s.signals === 1 ? '' : 's'} · ` +
    `${s.derived} derived · ${s.effects} effect${s.effects === 1 ? '' : 's'} · ${s.edges} edges`
  if (desc.insights.length === 0) {
    return `${header}\n\nNo health issues detected — no orphan signals, no runaway fan-out, no deep chains.`
  }
  const lines = desc.insights.map((i) => `• [${i.kind}] ${i.detail}`)
  return `${header}\n\n${desc.insights.length} insight${desc.insights.length === 1 ? '' : 's'}:\n${lines.join('\n')}`
}

function reactiveActivityBody(): string {
  activateReactiveDevtools()
  let fires: ReactiveFire[]
  let nodes: ReactiveGraph['nodes']
  try {
    fires = getReactiveFires()
    nodes = getReactiveGraph().nodes
  } catch {
    return 'Reactive activity unavailable.'
  }
  if (fires.length === 0) {
    return 'No reactive updates recorded yet.\n\nInteract with the app (click, type…) to make signals fire, then press ⟳.'
  }
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const label = (id: number): string => {
    const n = byId.get(id)
    return n ? `${n.name} (${n.kind})` : `#${id}`
  }
  // Recent fires, newest first (the tail of the bounded ring buffer).
  const recentLines = fires
    .slice(-10)
    .reverse()
    .map((f) => `• ${label(f.id)}`)
  // "Why did X update?" — the causal chain for the most-recent fire.
  // Non-null: the `fires.length === 0` early return above guarantees a last item.
  const latestId = fires[fires.length - 1]!.id
  const cause = getUpdateCause(latestId)
  const causeText = cause
    ? formatUpdateCause(cause)
    : `Why did ${label(latestId)} update?\n  (no causal chain — it fired with no earlier dependency, or the cause aged out of the ring buffer)`
  return `Recent updates (newest first):\n${recentLines.join('\n')}\n\n${causeText}`
}

function reactivePanelBody(): string {
  return _reactiveView === 'activity' ? reactiveActivityBody() : reactiveHealthBody()
}

function renderReactivePanel(): void {
  if (!_reactivePanelEl) return
  const body = _reactivePanelEl.querySelector('#__pyreon-rx-body')
  if (body) body.textContent = reactivePanelBody()
}

function createReactivePanel(): void {
  if (_reactivePanelEl) return
  const el = document.createElement('div')
  el.id = '__pyreon-reactive-overlay'
  el.style.cssText =
    'position:fixed;top:12px;right:12px;width:340px;max-height:70vh;overflow:auto;pointer-events:auto;background:#1a1a2e;color:#e0e0e0;font:12px/1.5 ui-monospace,monospace;border:1px solid #c026d3;border-radius:6px;z-index:1000000;box-shadow:0 4px 16px rgba(0,0,0,0.4);'
  const bar = document.createElement('div')
  bar.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid #33334d;position:sticky;top:0;background:#1a1a2e;'
  const title = document.createElement('strong')
  title.textContent = 'Pyreon · Reactivity Lens'
  title.style.color = '#e879f9'
  const btns = document.createElement('div')
  const refresh = document.createElement('button')
  refresh.textContent = '⟳'
  refresh.title = 'Refresh'
  const close = document.createElement('button')
  close.textContent = '✕'
  close.title = 'Close (Ctrl+Shift+R)'
  for (const b of [refresh, close]) {
    b.style.cssText =
      'background:transparent;border:none;color:#e0e0e0;cursor:pointer;font:14px ui-monospace,monospace;padding:0 4px;'
  }
  refresh.addEventListener('click', renderReactivePanel)
  close.addEventListener('click', disableReactiveOverlay)
  btns.append(refresh, close)
  bar.append(title, btns)

  // Tabs: Health (graph wiring) · Activity (recent fires + "why did X update?").
  const tabs = document.createElement('div')
  tabs.style.cssText = 'display:flex;gap:4px;padding:6px 10px;border-bottom:1px solid #33334d;'
  const healthTab = document.createElement('button')
  healthTab.id = '__pyreon-rx-tab-health'
  healthTab.textContent = 'Health'
  const activityTab = document.createElement('button')
  activityTab.id = '__pyreon-rx-tab-activity'
  activityTab.textContent = 'Activity'
  const paintTabs = (): void => {
    for (const [tab, view] of [
      [healthTab, 'health'],
      [activityTab, 'activity'],
    ] as const) {
      const active = _reactiveView === view
      tab.style.cssText =
        `background:${active ? '#c026d3' : 'transparent'};color:${active ? '#fff' : '#a0a0b8'};` +
        'border:1px solid #33334d;border-radius:4px;cursor:pointer;font:11px ui-monospace,monospace;padding:2px 10px;'
    }
  }
  const selectView = (view: ReactiveView): void => {
    _reactiveView = view
    paintTabs()
    renderReactivePanel()
  }
  healthTab.addEventListener('click', () => selectView('health'))
  activityTab.addEventListener('click', () => selectView('activity'))
  paintTabs()
  tabs.append(healthTab, activityTab)

  const body = document.createElement('pre')
  body.id = '__pyreon-rx-body'
  body.style.cssText = 'margin:0;padding:10px;white-space:pre-wrap;word-break:break-word;'
  el.append(bar, tabs, body)
  document.body.appendChild(el)
  _reactivePanelEl = el
}

function enableReactiveOverlay(): void {
  if (_reactivePanelActive) return
  _reactivePanelActive = true
  createReactivePanel()
  renderReactivePanel()
}

function disableReactiveOverlay(): void {
  if (!_reactivePanelActive) return
  _reactivePanelActive = false
  _reactiveView = 'health' // reopen starts on the Health tab
  if (_reactivePanelEl) {
    _reactivePanelEl.remove()
    _reactivePanelEl = null
  }
}

// ─── Installation ─────────────────────────────────────────────────────────────

let _installed = false
// Resolved once at module load — avoids per-call typeof branch in coverage
const _hasWindow = isClient

export function installDevTools(): void {
  if (!_hasWindow || _installed) return
  _installed = true

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
      getUpdateCause,
      formatUpdateCause,
      showOverlay: enableReactiveOverlay,
      hideOverlay: disableReactiveOverlay,
    },
  }

  // Attach to window — compatible with browser devtools extensions
  ;(window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ = devtools

  // Ctrl+Shift+P toggles the component inspector overlay;
  // Ctrl+Shift+R toggles the reactive-health overlay.
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'P') {
      e.preventDefault()
      if (_overlayActive) disableOverlay()
      else enableOverlay()
    } else if (e.ctrlKey && e.shiftKey && e.key === 'R') {
      e.preventDefault()
      if (_reactivePanelActive) disableReactiveOverlay()
      else enableReactiveOverlay()
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
      if (_overlayActive) disableOverlay()
      else enableOverlay()
    },
    /** Toggle the reactive-health overlay (or Ctrl+Shift+R) */
    reactivity: () => {
      if (_reactivePanelActive) disableReactiveOverlay()
      else enableReactiveOverlay()
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
