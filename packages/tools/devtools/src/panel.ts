import { createPanelToBackground, isBackgroundForward } from './messages'
import { buildMap, getChildren, getRoots } from './tree'
import type { PanelMessage, SerializedEntry } from './types'

// --- Panel UI: component tree viewer ---

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

const treeContainer = requireEl('tree-container')
const detailPlaceholder = requireEl('detail-placeholder')
const detailContent = requireEl('detail-content')
const detailName = requireEl('detail-name')
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

port.onDisconnect.addListener(() => {
  connected = false
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
  statsText.textContent = `${totalCount} components (${rootCount} root${rootCount !== 1 ? 's' : ''})`

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

  const node = document.createElement('div')
  node.className = `tree-node${isSelected ? ' selected' : ''}`
  node.style.paddingLeft = `${depth * 16 + 8}px`

  // Expand/collapse arrow
  const arrow = document.createElement('span')
  arrow.className = 'tree-arrow'
  if (hasChildren) {
    arrow.textContent = isExpanded ? '\u25BE' : '\u25B8'
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
    arrow.textContent = ' '
  }
  node.appendChild(arrow)

  // Component name
  const name = document.createElement('span')
  name.className = 'tree-name'
  name.textContent = entry.name
  node.appendChild(name)

  // Child count badge
  if (hasChildren) {
    const badge = document.createElement('span')
    badge.className = 'tree-badge'
    badge.textContent = `${kids.length}`
    node.appendChild(badge)
  }

  // Click to select + highlight
  node.addEventListener('click', () => {
    selectedId = entry.id
    sendToPage({ type: 'highlight', id: entry.id })
    renderTree()
    renderDetail()
  })

  container.appendChild(node)

  // Render children if expanded
  if (hasChildren && isExpanded) {
    for (const child of kids) {
      renderNode(child, depth + 1, container)
    }
  }
}

// Render detail pane
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

  detailName.textContent = `<${entry.name}>`
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
    detailChildren.textContent = '(none)'
  } else {
    for (const child of detailKids) {
      const childId = child.id
      const childEl = document.createElement('div')
      childEl.className = 'detail-child clickable'
      childEl.textContent = `${child.name} (${childId})`
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
      debouncedRefresh()
      break
    }
    case 'component-unmount': {
      if (msg.id === selectedId) {
        selectedId = null
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
      statsText.textContent = 'Pyreon detected'
      sendToPage({ type: 'get-all' })
      break
    }
  }
})

// Refresh button
refreshBtn.addEventListener('click', () => {
  sendToPage({ type: 'get-all' })
})

// Inspect button — toggles the framework's element-picker overlay on the
// inspected page (mirrors React/Vue DevTools' picker). The framework
// auto-disables the overlay after a pick, so this reflects the panel's
// last intent; clicking again re-arms it.
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

// Initial fetch
sendToPage({ type: 'get-all' })
