import { createPanelToBackground, isBackgroundForward } from './messages'
import { buildMap, getChildren, getRoots } from './tree'
import { bucketFires, layoutGraph, type ReactiveFire, type ReactiveGraph } from './reactive-view'
import type { PanelMessage, SerializedEntry } from './types'

// --- Panel UI: component tree viewer ---
// Implements the Claude-Design handoff (pyreon-devtools.jsx) Components
// surface: PxDevChrome shell + PxArtDevTree split. The other five designed
// tabs (Graph / Signals / Effects / Profiler / Console) need framework
// signal-graph APIs that `window.__PYREON_DEVTOOLS__` does not expose yet —
// they render as disabled chrome tabs with a roadmap tooltip.

// State
let allEntries: SerializedEntry[] = []
let selectedId: string | null = null
const expandedIds = new Set<string>()
let pyreonVersion = ''
let currentMap: Map<string, SerializedEntry> = new Map()
// children-by-parentId — the framework registers post-order so
// entry.childIds is unreliable; the tree is built from parentId.
let currentChildren: Map<string, SerializedEntry[]> = new Map()
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let connected = true
let pendingRequestTimer: ReturnType<typeof setTimeout> | null = null
// Freshly-mounted ids → the signature ember pulse. Pyreon components
// mount once (no re-render in a signal model), so "just mounted" is the
// truthful on-brand analog of the design's RE-RENDERED hot state.
const recentlyMounted = new Map<string, ReturnType<typeof setTimeout>>()
const HOT_MS = 1200

// DOM refs — panel.html ships these ids, but resolve defensively so a
// markup drift fails loudly with an actionable message instead of a
// downstream `null is not an object`.
function requireEl(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) {
    throw new Error(
      `[Pyreon] devtools panel: missing #${id} in panel.html — the panel markup and panel.ts are out of sync`,
    )
  }
  return el
}

const titlebarCaption = requireEl('titlebar-caption')
const tabLive = requireEl('tab-live')
const breadcrumbLeft = requireEl('breadcrumb-left')
const treeContainer = requireEl('tree-container')
const detailPlaceholder = requireEl('detail-placeholder')
const detailContent = requireEl('detail-content')
const detailName = requireEl('detail-name')
const detailChip = requireEl('detail-chip')
const detailId = requireEl('detail-id')
const detailParent = requireEl('detail-parent')
const detailChildren = requireEl('detail-children')
const componentCount = requireEl('component-count')
const versionSpan = requireEl('pyreon-version')
const refreshBtn = requireEl('refresh-btn')
const inspectBtn = requireEl('inspect-btn')
const statsText = requireEl('stats-text')

// Connect to background service worker
const tabId = chrome.devtools.inspectedWindow.tabId
const port = chrome.runtime.connect({ name: `pyreon-panel-${tabId}` })

// Fill the title-bar caption with the inspected origin + path (design
// PxDevChrome shows `pyreon devtools · localhost:5173 · /app/cart`).
chrome.devtools.inspectedWindow.eval('location.host + location.pathname', (result: unknown) => {
  if (typeof result === 'string' && result) {
    titlebarCaption.textContent = `pyreon devtools · ${result}`
  }
})

function setLive(on: boolean): void {
  tabLive.style.display = on ? '' : 'none'
}
setLive(false)

port.onDisconnect.addListener(() => {
  connected = false
  setLive(false)
  statsText.textContent = 'Disconnected — reopen DevTools to reconnect'
})

function sendToPage(payload: PanelMessage): void {
  if (!connected) return
  try {
    port.postMessage(createPanelToBackground(payload))

    // Start a timeout for data requests — show warning if no response
    if (payload.type === 'get-all') {
      if (pendingRequestTimer !== null) clearTimeout(pendingRequestTimer)
      pendingRequestTimer = setTimeout(() => {
        pendingRequestTimer = null
        statsText.textContent = 'No response from page — is Pyreon running?'
      }, 3000)
    }
  } catch {
    connected = false
    setLive(false)
    statsText.textContent = 'Disconnected — reopen DevTools to reconnect'
  }
}

// Render the component tree
function renderTree(): void {
  currentMap = buildMap(allEntries)
  currentChildren = getChildren(allEntries)
  const roots = getRoots(allEntries)
  const totalCount = allEntries.length
  const rootCount = roots.length

  componentCount.textContent = `${totalCount} component${totalCount !== 1 ? 's' : ''}`
  breadcrumbLeft.textContent =
    `component tree · subscription view · ${totalCount} mounted` +
    (rootCount ? ` · ${rootCount} root${rootCount !== 1 ? 's' : ''}` : '')

  if (pyreonVersion) {
    versionSpan.textContent = `v${pyreonVersion}`
  }

  treeContainer.innerHTML = ''

  if (roots.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'tree-empty'
    empty.textContent = 'No components detected'
    treeContainer.appendChild(empty)
    return
  }

  for (const root of roots) {
    renderNode(root, 0, treeContainer)
  }
}

function renderNode(entry: SerializedEntry, depth: number, container: HTMLElement): void {
  const kids = currentChildren.get(entry.id) ?? []
  const hasChildren = kids.length > 0
  const isExpanded = expandedIds.has(entry.id)
  const isSelected = entry.id === selectedId
  const isHot = recentlyMounted.has(entry.id)

  const node = document.createElement('div')
  node.className = 'tree-node' + (isSelected ? ' selected' : '') + (isHot ? ' hot pulsing' : '')

  // Left: caret + hot dot + name (design `.tn-label`)
  const label = document.createElement('div')
  label.className = 'tn-label'
  label.style.paddingLeft = `${depth * 18}px`

  const arrow = document.createElement('span')
  arrow.className = 'tree-arrow'
  if (hasChildren) {
    arrow.textContent = isExpanded ? '▾' : '▸'
    arrow.addEventListener('click', (e) => {
      e.stopPropagation()
      if (expandedIds.has(entry.id)) {
        expandedIds.delete(entry.id)
      } else {
        expandedIds.add(entry.id)
      }
      renderTree()
    })
  } else {
    arrow.textContent = '·'
  }
  label.appendChild(arrow)

  if (isHot) {
    const dot = document.createElement('span')
    dot.className = 'tree-dot'
    dot.textContent = '●'
    label.appendChild(dot)
  }

  const name = document.createElement('span')
  name.className = 'tree-name'
  name.textContent = entry.name
  label.appendChild(name)
  node.appendChild(label)

  // Mid: subscription/child count (design `N sub`)
  const sub = document.createElement('div')
  sub.className = 'tree-sub'
  sub.textContent = hasChildren ? `${kids.length} sub${kids.length !== 1 ? 's' : ''}` : ''
  node.appendChild(sub)

  // Right: state tag (design `RE-RENDERED` → `MOUNTED` for the signal model)
  const tag = document.createElement('div')
  tag.className = 'tree-tag'
  tag.textContent = isHot ? 'MOUNTED' : ''
  node.appendChild(tag)

  node.addEventListener('click', () => {
    selectedId = entry.id
    sendToPage({ type: 'highlight', id: entry.id })
    renderTree()
    renderDetail()
  })

  container.appendChild(node)

  if (hasChildren && isExpanded) {
    for (const child of kids) {
      renderNode(child, depth + 1, container)
    }
  }
}

// Render detail pane (design PxArtDevTree right column)
function renderDetail(): void {
  if (!selectedId) {
    detailPlaceholder.style.display = ''
    detailContent.style.display = 'none'
    return
  }

  const entry = currentMap.get(selectedId)

  if (!entry) {
    detailPlaceholder.style.display = ''
    detailContent.style.display = 'none'
    return
  }

  detailPlaceholder.style.display = 'none'
  detailContent.style.display = ''

  detailName.textContent = `<${entry.name}/>`
  const hot = recentlyMounted.has(entry.id)
  detailChip.textContent = hot ? 'just mounted' : 'component'
  detailChip.className = hot ? 'chip ember' : 'chip'
  detailId.textContent = entry.id

  if (entry.parentId) {
    const parent = currentMap.get(entry.parentId)
    detailParent.textContent = parent ? `${parent.name} (${entry.parentId})` : entry.parentId
    detailParent.className = 'detail-value clickable'
    detailParent.onclick = () => {
      if (entry.parentId) {
        selectedId = entry.parentId
        sendToPage({ type: 'highlight', id: entry.parentId })
        renderTree()
        renderDetail()
      }
    }
  } else {
    detailParent.textContent = '(root)'
    detailParent.className = 'detail-value'
    detailParent.onclick = null
  }

  detailChildren.innerHTML = ''
  const detailKids = currentChildren.get(entry.id) ?? []
  if (detailKids.length === 0) {
    const none = document.createElement('span')
    none.className = 'detail-value'
    none.style.color = 'var(--text-dim)'
    none.textContent = '(none)'
    detailChildren.appendChild(none)
  } else {
    for (const child of detailKids) {
      const childId = child.id
      const childEl = document.createElement('div')
      childEl.className = 'detail-child clickable'
      const nm = document.createElement('span')
      nm.textContent = child.name
      const cid = document.createElement('span')
      cid.className = 'cid'
      cid.textContent = childId
      childEl.appendChild(nm)
      childEl.appendChild(cid)
      childEl.addEventListener('click', () => {
        selectedId = childId
        sendToPage({ type: 'highlight', id: childId })
        renderTree()
        renderDetail()
      })
      detailChildren.appendChild(childEl)
    }
  }
}

// Mark a freshly-mounted component hot for HOT_MS, then auto-clear.
function markHot(id: string): void {
  const existing = recentlyMounted.get(id)
  if (existing !== undefined) clearTimeout(existing)
  recentlyMounted.set(
    id,
    setTimeout(() => {
      recentlyMounted.delete(id)
      renderTree()
      if (id === selectedId) renderDetail()
    }, HOT_MS),
  )
}

// Debounced tree refresh (for rapid mount/unmount events)
function debouncedRefresh(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    sendToPage({ type: 'get-all' })
  }, 100)
}

// Handle messages from background
port.onMessage.addListener((message: unknown) => {
  if (!isBackgroundForward(message)) return

  const msg = message.payload

  switch (msg.type) {
    case 'all-result': {
      if (pendingRequestTimer !== null) {
        clearTimeout(pendingRequestTimer)
        pendingRequestTimer = null
      }
      const isFirstLoad = allEntries.length === 0
      allEntries = msg.entries
      connected = true
      setLive(true)
      statsText.textContent = ''
      // Auto-expand roots on first load
      if (isFirstLoad) {
        for (const entry of getRoots(allEntries)) {
          expandedIds.add(entry.id)
        }
      }
      renderTree()
      renderDetail()
      break
    }
    case 'component-mount': {
      markHot(msg.entry.id)
      debouncedRefresh()
      break
    }
    case 'component-unmount': {
      if (msg.id === selectedId) {
        selectedId = null
      }
      const t = recentlyMounted.get(msg.id)
      if (t !== undefined) {
        clearTimeout(t)
        recentlyMounted.delete(msg.id)
      }
      debouncedRefresh()
      break
    }
    case 'pyreon-detected': {
      if (pendingRequestTimer !== null) {
        clearTimeout(pendingRequestTimer)
        pendingRequestTimer = null
      }
      pyreonVersion = msg.version
      versionSpan.textContent = `v${pyreonVersion}`
      connected = true
      setLive(true)
      statsText.textContent = 'Pyreon detected'
      sendToPage({ type: 'get-all' })
      break
    }
    case 'reactive-available': {
      setReactiveAvailable(msg.available)
      break
    }
    case 'reactive-snapshot': {
      lastGraph = msg.graph
      lastFires = msg.fires
      renderActiveReactiveView()
      break
    }
    case 'reactive-eval-result': {
      appendConsole(msg.result, msg.ok ? 'cl-out' : 'cl-err')
      break
    }
  }
})

// Refresh control (design chrome ↻)
refreshBtn.addEventListener('click', () => {
  sendToPage({ type: 'get-all' })
})

// Inspect control (design chrome ◉) — toggles the framework's
// element-picker overlay on the inspected page (mirrors React/Vue
// DevTools' picker). The framework auto-disables the overlay after a
// pick, so this reflects the panel's last intent; clicking re-arms it.
let overlayEnabled = false
function setOverlay(enabled: boolean): void {
  overlayEnabled = enabled
  inspectBtn.classList.toggle('active', enabled)
  inspectBtn.setAttribute('aria-pressed', String(enabled))
  sendToPage({ type: 'toggle-overlay', enabled })
}
inspectBtn.addEventListener('click', () => {
  setOverlay(!overlayEnabled)
})

// ── Tab switching + reactive surfaces ───────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg'
const REACTIVE_TABS = new Set(['signals', 'graph', 'effects', 'profiler', 'console'])
const NEEDS_HTML =
  'The reactive surfaces need <strong>@pyreon/runtime-dom</strong> with the ' +
  'reactive-devtools Foundation (exposes <strong>__PYREON_DEVTOOLS__.reactive</strong>). ' +
  'Upgrade the framework, then reload — Components works regardless.'

let activeTab = 'components'
let reactiveAvailable = false
let reactiveActivated = false
let lastGraph: ReactiveGraph = { nodes: [], edges: [] }
let lastFires: ReactiveFire[] = []
let pollTimer: ReturnType<typeof setInterval> | null = null

const tabEls = Array.from(document.querySelectorAll<HTMLElement>('.tab'))
const viewEls = Array.from(document.querySelectorAll<HTMLElement>('.view'))
const consoleInput = requireEl('console-input') as HTMLInputElement
const consoleLog = requireEl('console-log')

function setActiveTab(tab: string): void {
  activeTab = tab
  for (const t of tabEls) t.classList.toggle('active', t.dataset.tab === tab)
  for (const v of viewEls) v.classList.toggle('active', v.dataset.view === tab)
  if (REACTIVE_TABS.has(tab)) {
    ensurePolling()
    if (reactiveAvailable) sendToPage({ type: 'reactive-poll' })
    renderActiveReactiveView()
  } else {
    stopPolling()
  }
}

for (const t of tabEls) {
  t.addEventListener('click', () => {
    const tab = t.dataset.tab
    if (tab) setActiveTab(tab)
  })
}

function ensurePolling(): void {
  if (pollTimer !== null) return
  pollTimer = setInterval(() => {
    if (reactiveAvailable && REACTIVE_TABS.has(activeTab)) {
      sendToPage({ type: 'reactive-poll' })
    }
  }, 1000)
}

function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function setReactiveAvailable(available: boolean): void {
  reactiveAvailable = available
  for (const t of tabEls) {
    if (t.classList.contains('reactive-tab')) {
      t.classList.toggle('unavailable', !available)
    }
  }
  for (const v of viewEls) {
    const needs = v.querySelector<HTMLElement>('.rd-needs')
    if (!needs) continue
    if (available) {
      needs.hidden = true
    } else {
      needs.hidden = false
      needs.innerHTML = NEEDS_HTML
    }
  }
  if (available && !reactiveActivated) {
    reactiveActivated = true
    sendToPage({ type: 'reactive-activate' })
    if (REACTIVE_TABS.has(activeTab)) sendToPage({ type: 'reactive-poll' })
  }
}

function renderActiveReactiveView(): void {
  switch (activeTab) {
    case 'signals':
      renderSignals()
      break
    case 'graph':
      renderGraph()
      break
    case 'effects':
      renderEffects()
      break
    case 'profiler':
      renderProfiler()
      break
  }
}

// Signals — design PxArtDevSignals table
function renderSignals(): void {
  const host = requireEl('signals-table')
  host.innerHTML = ''
  const head = document.createElement('div')
  head.className = 'sig-row head'
  for (const h of ['NAME', 'KIND', 'VALUE', 'SUBS', 'FIRES']) {
    const c = document.createElement('div')
    if (h === 'SUBS' || h === 'FIRES') c.className = 'num'
    c.textContent = h
    head.appendChild(c)
  }
  host.appendChild(head)

  const rows = lastGraph.nodes.slice().sort((a, b) => b.fires - a.fires || a.id - b.id)
  for (const n of rows) {
    const row = document.createElement('div')
    const hot = n.lastFire !== null && performance.now() - n.lastFire < 1500
    row.className = `sig-row${hot ? ' hot' : ''}`

    const nm = document.createElement('div')
    nm.className = 'nm'
    if (hot) {
      const d = document.createElement('span')
      d.className = 'dot'
      d.textContent = '●'
      nm.appendChild(d)
    }
    const nmTxt = document.createElement('span')
    nmTxt.textContent = n.name
    nm.appendChild(nmTxt)
    row.appendChild(nm)

    const kind = document.createElement('div')
    kind.className = `sig-kind ${n.kind}`
    kind.textContent = n.kind
    row.appendChild(kind)

    const v = document.createElement('div')
    v.className = 'v'
    v.textContent = n.kind === 'effect' ? '—' : n.value
    row.appendChild(v)

    const subs = document.createElement('div')
    subs.className = 'num'
    subs.textContent = String(n.subscribers)
    row.appendChild(subs)

    const fires = document.createElement('div')
    fires.className = `num${n.fires > 10 ? ' hot' : ''}`
    fires.textContent = String(n.fires)
    row.appendChild(fires)

    host.appendChild(row)
  }
}

// Graph — design PxArtDevGraph node/edge diagram
function renderGraph(): void {
  const svg = document.getElementById('graph-svg') as unknown as SVGSVGElement | null
  if (!svg) return
  const laid = layoutGraph(lastGraph)
  svg.setAttribute('viewBox', `0 0 ${laid.width} ${laid.height}`)
  while (svg.firstChild) svg.removeChild(svg.firstChild)

  const pos = new Map(laid.nodes.map((n) => [n.id, n]))
  const recent = new Set(
    lastGraph.nodes
      .filter((n) => n.lastFire !== null && performance.now() - n.lastFire < 1500)
      .map((n) => n.id),
  )

  for (const e of laid.edges) {
    const a = pos.get(e.from)
    const b = pos.get(e.to)
    if (!a || !b) continue
    const line = document.createElementNS(SVG_NS, 'line')
    line.setAttribute('x1', String(a.x + 55))
    line.setAttribute('y1', String(a.y))
    line.setAttribute('x2', String(b.x - 55))
    line.setAttribute('y2', String(b.y))
    const hot = recent.has(e.from) && recent.has(e.to)
    line.setAttribute('class', `gedge${hot ? ' hot' : ''}`)
    svg.appendChild(line)
  }

  for (const n of laid.nodes) {
    const g = document.createElementNS(SVG_NS, 'g')
    g.setAttribute('transform', `translate(${n.x},${n.y})`)
    g.setAttribute('class', `gnode${recent.has(n.id) ? ' hot' : ''}`)
    const rect = document.createElementNS(SVG_NS, 'rect')
    rect.setAttribute('x', '-55')
    rect.setAttribute('y', '-12')
    rect.setAttribute('width', '110')
    rect.setAttribute('height', '24')
    rect.setAttribute('rx', '3')
    g.appendChild(rect)
    const dot = document.createElementNS(SVG_NS, 'circle')
    dot.setAttribute('cx', '-45')
    dot.setAttribute('cy', '0')
    dot.setAttribute('r', '3')
    dot.setAttribute('class', `kdot ${n.kind}`)
    g.appendChild(dot)
    const text = document.createElementNS(SVG_NS, 'text')
    text.setAttribute('x', '-37')
    text.setAttribute('y', '4')
    text.textContent = n.name.length > 14 ? `${n.name.slice(0, 13)}…` : n.name
    g.appendChild(text)
    svg.appendChild(g)
  }
}

// Effects — design PxArtDevEffects lanes (one lane per node that fired)
function renderEffects(): void {
  const host = requireEl('effects-lanes')
  host.innerHTML = ''
  if (lastFires.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'tree-empty'
    empty.textContent = 'No reactive activity recorded yet — interact with the page'
    host.appendChild(empty)
    return
  }
  const nameById = new Map(lastGraph.nodes.map((n) => [n.id, n]))
  let lo = Infinity
  let hi = -Infinity
  for (const f of lastFires) {
    if (f.ts < lo) lo = f.ts
    if (f.ts > hi) hi = f.ts
  }
  const span = Math.max(1, hi - lo)
  const byId = new Map<number, ReactiveFire[]>()
  for (const f of lastFires) {
    const arr = byId.get(f.id)
    if (arr) arr.push(f)
    else byId.set(f.id, [f])
  }
  const lanes = Array.from(byId.entries()).sort((a, b) => b[1].length - a[1].length)
  for (const [id, fires] of lanes) {
    const node = nameById.get(id)
    const lane = document.createElement('div')
    lane.className = 'fx-lane'
    const nm = document.createElement('div')
    nm.className = 'nm'
    nm.textContent = node ? node.name : `#${id}`
    lane.appendChild(nm)
    const track = document.createElement('div')
    track.className = 'fx-track'
    for (const f of fires) {
      const tick = document.createElement('i')
      tick.className = node ? node.kind : 'effect'
      tick.style.left = `${((f.ts - lo) / span) * 100}%`
      track.appendChild(tick)
    }
    lane.appendChild(track)
    host.appendChild(lane)
  }
}

// Profiler — design PxArtDevProfiler per-frame fire bars
function renderProfiler(): void {
  const svg = document.getElementById('profiler-svg') as unknown as SVGSVGElement | null
  if (!svg) return
  while (svg.firstChild) svg.removeChild(svg.firstChild)
  const b = bucketFires(lastFires, 100)
  const w = 600
  const h = 220
  const bw = w / b.frames.length
  b.frames.forEach((count, i) => {
    const barH = (count / b.max) * (h - 20)
    const rect = document.createElementNS(SVG_NS, 'rect')
    rect.setAttribute('class', 'pf-bar')
    rect.setAttribute('x', String(i * bw + 1))
    rect.setAttribute('y', String(h - barH))
    rect.setAttribute('width', String(Math.max(1, bw - 2)))
    rect.setAttribute('height', String(barH))
    svg.appendChild(rect)
  })
  const summary = requireEl('profiler-summary')
  summary.textContent =
    `${b.total} fire${b.total === 1 ? '' : 's'} · ${b.frames.length} × ` +
    `${b.frameMs}ms frame${b.frames.length === 1 ? '' : 's'} · peak ${b.max}/frame`
}

// Console — design PxArtDevConsole eval surface
function appendConsole(text: string, cls: 'cl-in' | 'cl-out' | 'cl-err'): void {
  const line = document.createElement('div')
  line.className = cls
  line.textContent = text
  consoleLog.appendChild(line)
  consoleLog.scrollTop = consoleLog.scrollHeight
}

consoleInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key !== 'Enter') return
  const expr = consoleInput.value.trim()
  if (!expr) return
  appendConsole(expr, 'cl-in')
  consoleInput.value = ''
  if (!reactiveAvailable) {
    appendConsole('reactive bridge unavailable — upgrade @pyreon/runtime-dom', 'cl-err')
    return
  }
  sendToPage({ type: 'reactive-eval', expr })
})

// Initial fetch
sendToPage({ type: 'get-all' })
