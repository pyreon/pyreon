import { createPanelToBackground, isBackgroundForward } from './messages'
import { buildMap, getChildren, getRoots } from './tree'
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
chrome.devtools.inspectedWindow.eval(
  'location.host + location.pathname',
  (result: unknown) => {
    if (typeof result === 'string' && result) {
      titlebarCaption.textContent = `pyreon devtools · ${result}`
    }
  },
)

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

function renderNode(
  entry: SerializedEntry,
  depth: number,
  container: HTMLElement,
): void {
  const kids = currentChildren.get(entry.id) ?? []
  const hasChildren = kids.length > 0
  const isExpanded = expandedIds.has(entry.id)
  const isSelected = entry.id === selectedId
  const isHot = recentlyMounted.has(entry.id)

  const node = document.createElement('div')
  node.className =
    'tree-node' +
    (isSelected ? ' selected' : '') +
    (isHot ? ' hot pulsing' : '')

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
  sub.textContent = hasChildren
    ? `${kids.length} sub${kids.length !== 1 ? 's' : ''}`
    : ''
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
    detailParent.textContent = parent
      ? `${parent.name} (${entry.parentId})`
      : entry.parentId
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

// Disabled chrome tabs — the five designed surfaces with no backing
// framework API. Clicking surfaces the roadmap reason rather than a
// dead no-op.
for (const tab of document.querySelectorAll<HTMLElement>('.tab.disabled')) {
  tab.addEventListener('click', () => {
    statsText.textContent = `"${tab.textContent ?? ''}" needs the Pyreon signal-graph devtools API — roadmap`
  })
}

// Initial fetch
sendToPage({ type: 'get-all' })
