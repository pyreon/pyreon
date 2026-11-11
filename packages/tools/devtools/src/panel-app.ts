import {
  type Batch,
  batchLabel,
  causeView,
  countKinds,
  createRecorder,
  displayName,
  effectLanes,
  everythingScope,
  formatAgo,
  formatSpan,
  ingestFires,
  lastCascadeIds,
  layoutGraph,
  NODE_H,
  NODE_W,
  type NodeInfo,
  type Recorder,
  selectedScope,
  signalRows,
  summarize,
  withDisplayNames,
} from './reactive-view'
import { ancestorIds, flattenTree, indexTree, ownerPath, type TreeIndex, type TreeRow } from './tree'
import type {
  ComponentDetail,
  ConsoleEntry,
  HookMessage,
  PanelMessage,
  ReactiveFire,
  ReactiveGraph,
  ReactiveNode,
  SerializedEntry,
} from './types'
import { scrollToRow, visibleRange } from './virtual'

// --- The devtools panel UI ---
// Renders the six tabs of the design (Components, Graph, Signals, Effects,
// Profiler, Console) into `root`, talking to the page only through
// `transport`. Everything that arrives is plain data (structured-cloned by
// the extension messaging, or by the test transport), and the panel keeps
// ids, never page objects. Page-provided strings are only ever set with
// `textContent`, never parsed as HTML.
//
// Lists that can be long are virtualised (tree, signals) or capped with a
// visible "showing N of M" (graph, effect lanes, profiler batches, console).

export interface PanelTransport {
  send(msg: PanelMessage): void
  onMessage(cb: (msg: HookMessage) => void): void
  onDisconnect(cb: () => void): void
}

export type PanelTheme = 'dark' | 'light'

export interface PanelOptions {
  theme: PanelTheme
  /** Graph poll interval while the panel is open (ms). */
  pollMs?: number
  /** Fire-only poll interval while the profiler records (ms). */
  recordPollMs?: number
}

export interface PanelApp {
  setTheme(theme: PanelTheme): void
  /** Switch tab programmatically (tests, screenshots). */
  selectTab(tab: TabId): void
  dispose(): void
}

export type TabId = 'components' | 'graph' | 'signals' | 'effects' | 'profiler' | 'console'

const TABS: { id: TabId; label: string }[] = [
  { id: 'components', label: 'Components' },
  { id: 'graph', label: 'Graph' },
  { id: 'signals', label: 'Signals' },
  { id: 'effects', label: 'Effects' },
  { id: 'profiler', label: 'Profiler' },
  { id: 'console', label: 'Console' },
]

export const TREE_ROW_H = 28
export const SIGNAL_ROW_H = 32
export const GRAPH_CAP = 120
export const LANE_CAP = 150
export const PROFILER_ROWS_CAP = 300
export const CONSOLE_LINES_CAP = 500
const HOT_MS = 1400
const SVG_NS = 'http://www.w3.org/2000/svg'

type Attrs = Record<string, string | number | boolean | null | undefined>

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') node.className = String(v)
    else if (k === 'text') node.textContent = String(v)
    else node.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue
    node.append(c)
  }
  return node
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue
    node.setAttribute(k, String(v))
  }
  return node
}

function icon(paths: string): SVGSVGElement {
  const s = svg('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' })
  // `paths` is a constant from this file, never page data.
  s.innerHTML = paths
  return s
}

const ICON_PICK =
  '<path d="M3 3l4 10 1.6-4.2L13 7.2 3 3Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'
const ICON_RECORD = '<circle cx="8" cy="8" r="4.5" fill="currentColor"/>'
const ICON_CLEAR =
  '<circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4.2 11.8l7.6-7.6" stroke="currentColor" stroke-width="1.4"/>'

function brandMark(): SVGSVGElement {
  const s = svg('svg', { width: 20, height: 20, viewBox: '0 0 120 120', 'aria-hidden': 'true' })
  s.innerHTML =
    '<defs><linearGradient id="pd-eg" x1="0" x2="1"><stop offset="0" class="eg-1"/><stop offset=".55" class="eg-2"/><stop offset="1" class="eg-3"/></linearGradient></defs>' +
    '<circle cx="36" cy="64" r="22" fill="url(#pd-eg)"/>' +
    '<path d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86" stroke="currentColor" stroke-width="12" fill="none" stroke-linecap="square"/>'
  return s
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

function clock(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** A message with every `[Pyreon]` prefix in bold. */
function messageNode(text: string): HTMLElement {
  const span = el('span', { class: 'msg' })
  const parts = text.split('[Pyreon]')
  parts.forEach((part, i) => {
    if (i > 0) span.append(el('b', { text: '[Pyreon]' }))
    if (part) span.append(part)
  })
  return span
}

interface VirtualList {
  refresh(): void
  /** Scroll so row `i` is visible. */
  reveal(i: number): void
  dispose(): void
}

function virtualList(
  scroller: HTMLElement,
  rowHeight: number,
  count: () => number,
  render: (i: number) => HTMLElement,
): VirtualList {
  const spacer = el('div', { class: 'v-spacer', role: 'none' })
  scroller.append(spacer)
  let frame = 0
  const draw = (): void => {
    frame = 0
    const n = count()
    spacer.style.height = `${n * rowHeight}px`
    const { start, end } = visibleRange(scroller.scrollTop, scroller.clientHeight || 600, rowHeight, n)
    const rows: HTMLElement[] = []
    for (let i = start; i < end; i++) {
      const row = render(i)
      row.style.transform = `translateY(${i * rowHeight}px)`
      rows.push(row)
    }
    spacer.replaceChildren(...rows)
  }
  const onScroll = (): void => {
    if (frame === 0) frame = requestAnimationFrame(draw)
  }
  scroller.addEventListener('scroll', onScroll, { passive: true })
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(onScroll) : null
  ro?.observe(scroller)
  return {
    refresh: draw,
    reveal(i) {
      const next = scrollToRow(i, scroller.scrollTop, scroller.clientHeight || 600, rowHeight)
      if (next !== scroller.scrollTop) scroller.scrollTop = next
      draw()
    },
    dispose() {
      scroller.removeEventListener('scroll', onScroll)
      ro?.disconnect()
      if (frame !== 0) cancelAnimationFrame(frame)
    },
  }
}

export function createPanelApp(
  root: HTMLElement,
  transport: PanelTransport,
  options: PanelOptions,
): PanelApp {
  const pollMs = options.pollMs ?? 1000
  const recordPollMs = options.recordPollMs ?? 250

  // ── State (plain data only) ─────────────────────────────────────────
  let activeTab: TabId = 'components'
  let detected = false
  let reactiveAvailable = false
  let connected = true
  let host = ''
  let entries: SerializedEntry[] = []
  let index: TreeIndex = indexTree([])
  let treeRows: TreeRow[] = []
  const expanded = new Set<string>()
  let treeFilter = ''
  let selectedId: string | null = null
  let activeRow = 0
  let detail: ComponentDetail | null = null
  const hot = new Map<string, number>()
  let graph: ReactiveGraph = { nodes: [], edges: [] }
  let fires: ReactiveFire[] = []
  let pageNow = 0
  const nodeInfo = new Map<number, NodeInfo>()
  let signalFilter = ''
  let sigRows: ReactiveNode[] = []
  let selectedNode: number | null = null
  let graphScope: 'selected' | 'everything' = 'selected'
  let recording = false
  let recordBaselinePending = false
  let recorder: Recorder = createRecorder()
  let logLines: { time: number; kind: 'warn' | 'error' | 'in' | 'out'; text: string }[] = []
  let pickerOn = false
  let hotTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let recordTimer: ReturnType<typeof setInterval> | null = null
  let noResponseTimer: ReturnType<typeof setTimeout> | null = null

  // Every listener the panel adds goes through `on()`, tied to one
  // AbortController that `dispose()` aborts: one cleanup for all of them.
  const listeners = new AbortController()
  function on<K extends keyof HTMLElementEventMap>(
    target: EventTarget,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
  ): void {
    target.addEventListener(type, fn as EventListener, { signal: listeners.signal })
  }

  const send = (msg: PanelMessage): void => {
    if (connected) transport.send(msg)
  }

  // ── Shell ───────────────────────────────────────────────────────────
  root.dataset.theme = options.theme
  root.classList.add('pd-root')
  const tabButtons = new Map<TabId, HTMLButtonElement>()
  const tabCounts = new Map<TabId, HTMLSpanElement>()
  const views = new Map<TabId, HTMLElement>()

  const tablist = el('div', { class: 'app-tabs', role: 'tablist', 'aria-label': 'Devtools views' })
  for (const t of TABS) {
    const ct = el('span', { class: 'ct' })
    const b = el(
      'button',
      {
        type: 'button',
        role: 'tab',
        id: `pd-tab-${t.id}`,
        'aria-controls': `pd-view-${t.id}`,
        'aria-selected': t.id === activeTab ? 'true' : 'false',
        tabindex: t.id === activeTab ? 0 : -1,
        'data-tab': t.id,
      },
      t.label,
      ct,
    )
    on(b, 'click', () => setTab(t.id))
    tabButtons.set(t.id, b)
    tabCounts.set(t.id, ct)
    tablist.append(b)
  }
  on(tablist, 'keydown', (e) => {
    const order = TABS.map((t) => t.id)
    const i = order.indexOf(activeTab)
    let next: TabId | null = null
    if (e.key === 'ArrowRight') next = order[(i + 1) % order.length] as TabId
    else if (e.key === 'ArrowLeft') next = order[(i - 1 + order.length) % order.length] as TabId
    else if (e.key === 'Home') next = order[0] as TabId
    else if (e.key === 'End') next = order[order.length - 1] as TabId
    if (next) {
      e.preventDefault()
      setTab(next)
      tabButtons.get(next)?.focus()
    }
  })

  const pickBtn = el(
    'button',
    {
      type: 'button',
      class: 'ib',
      'aria-pressed': 'false',
      'aria-label': 'Inspect an element on the page (Ctrl+Shift+P)',
      title: 'Inspect an element on the page (Ctrl+Shift+P)',
    },
    icon(ICON_PICK),
  )
  on(pickBtn, 'click', () => {
    pickerOn = !pickerOn
    pickBtn.setAttribute('aria-pressed', String(pickerOn))
    send({ type: 'toggle-overlay', enabled: pickerOn })
  })

  const top = el(
    'header',
    { class: 'app-top' },
    el('span', { class: 'brand' }, brandMark(), 'Pyreon'),
    tablist,
    el('span', { class: 'sp' }),
    pickBtn,
  )

  // Status bar
  const stDot = el('i', { 'aria-hidden': 'true' })
  const stConn = el('span', { class: 'st-conn' }, stDot, el('span', { text: 'connecting…' }))
  const stComponents = el('span')
  const stSignals = el('span')
  const stEffects = el('span')
  const status = el(
    'footer',
    { class: 'app-status', role: 'status', 'aria-live': 'polite' },
    stConn,
    stComponents,
    stSignals,
    stEffects,
  )

  // ── Components view ─────────────────────────────────────────────────
  const treeFilterInput = el('input', {
    type: 'search',
    placeholder: 'Filter',
    'aria-label': 'Filter components',
  })
  const treeScroller = el('div', {
    class: 'v-scroll tree',
    role: 'tree',
    tabindex: 0,
    'aria-label': 'Component tree',
  })
  const treeEmpty = el('div', { class: 'empty2', hidden: true })
  const treePane = el(
    'div',
    { class: 'pane pane-col' },
    el('div', { class: 'pane-h' }, 'components', el('span', { class: 'sp' }), treeFilterInput),
    treeEmpty,
    treeScroller,
  )
  const inspector = el('div', { class: 'pane', 'aria-label': 'Inspector', role: 'region' })
  const componentsView = el('div', { class: 'dt-split' }, treePane, inspector)

  const rowId = (i: number): string => `pd-tr-${i}`
  const treeList = virtualList(
    treeScroller,
    TREE_ROW_H,
    () => treeRows.length,
    (i) => {
      const r = treeRows[i] as TreeRow
      const id = r.entry.id
      const row = el('div', {
        class: `trow${hot.has(id) ? ' pulse' : ''}${i === activeRow ? ' active' : ''}`,
        role: 'treeitem',
        id: rowId(i),
        'aria-level': r.depth + 1,
        'aria-selected': id === selectedId ? 'true' : 'false',
        'aria-expanded': r.childCount > 0 ? String(r.expanded) : null,
        'data-id': id,
      })
      row.style.paddingLeft = `${10 + r.depth * 14}px`
      row.dataset.index = String(i)
      const tw = el('span', { class: 'tw', 'aria-hidden': 'true' }, r.childCount > 0 ? (r.expanded ? '▾' : '▸') : '')
      row.append(tw, el('span', { class: `tg${r.match ? ' hit' : ''}`, text: r.entry.name }))
      if (r.childCount > 0 && !r.expanded) {
        row.append(el('span', { class: 'meta', text: plural(r.childCount, 'child', 'children') }))
      } else if (hot.has(id)) {
        row.append(el('span', { class: 'meta', text: 'just mounted' }))
      }
      return row
    },
  )
  // One delegated listener for every (virtualised, re-created) row.
  on(treeScroller, 'click', (e) => {
    const target = e.target as Element
    const row = target.closest<HTMLElement>('.trow')
    const r = row ? treeRows[Number(row.dataset.index)] : undefined
    if (!row || !r) return
    if (target.closest('.tw') && r.childCount > 0) {
      toggle(r.entry.id)
      return
    }
    activeRow = Number(row.dataset.index)
    select(r.entry.id)
    treeScroller.focus({ preventScroll: true })
  })

  function rebuildTree(): void {
    treeRows = flattenTree(index, expanded, treeFilter)
    if (activeRow >= treeRows.length) activeRow = Math.max(0, treeRows.length - 1)
    const sel = selectedId === null ? -1 : treeRows.findIndex((r) => r.entry.id === selectedId)
    if (sel >= 0) activeRow = sel
    treeScroller.setAttribute('aria-activedescendant', treeRows.length ? rowId(activeRow) : '')
    if (!detected) {
      treeEmpty.hidden = false
      treeEmpty.textContent = 'Waiting for a Pyreon app on this page…'
    } else if (entries.length === 0) {
      treeEmpty.hidden = false
      treeEmpty.textContent = 'No components mounted yet.'
    } else if (treeRows.length === 0) {
      treeEmpty.hidden = false
      treeEmpty.textContent = `No component matches "${treeFilter}".`
    } else {
      treeEmpty.hidden = true
    }
    treeList.refresh()
  }

  /** First load: open the tree breadth-first until about a screenful shows. */
  function autoExpand(): void {
    let frontier = index.roots.slice()
    let visible = frontier.length
    while (frontier.length > 0 && visible < 40) {
      const next: SerializedEntry[] = []
      for (const e of frontier) {
        const kids = index.children.get(e.id) ?? []
        if (kids.length === 0 || visible + kids.length > 60) continue
        expanded.add(e.id)
        visible += kids.length
        next.push(...kids)
      }
      frontier = next
    }
  }

  function toggle(id: string): void {
    if (expanded.has(id)) expanded.delete(id)
    else expanded.add(id)
    rebuildTree()
  }

  function select(id: string): void {
    selectedId = id
    detail = null
    // Reveal the selection: expand its ancestors.
    for (const a of ancestorIds(id, index.map)) expanded.add(a)
    rebuildTree()
    const i = treeRows.findIndex((r) => r.entry.id === id)
    if (i >= 0) {
      activeRow = i
      treeList.reveal(i)
      treeScroller.setAttribute('aria-activedescendant', rowId(i))
    }
    send({ type: 'highlight', id })
    send({ type: 'inspect', id })
    renderInspector()
  }

  on(treeFilterInput, 'input', () => {
    treeFilter = treeFilterInput.value
    activeRow = 0
    treeScroller.scrollTop = 0
    rebuildTree()
  })

  on(treeScroller, 'keydown', (e) => {
    if (treeRows.length === 0) return
    const r = treeRows[activeRow]
    let next = activeRow
    switch (e.key) {
      case 'ArrowDown':
        next = Math.min(treeRows.length - 1, activeRow + 1)
        break
      case 'ArrowUp':
        next = Math.max(0, activeRow - 1)
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = treeRows.length - 1
        break
      case 'ArrowRight':
        if (r && r.childCount > 0 && !r.expanded) {
          e.preventDefault()
          toggle(r.entry.id)
          return
        }
        if (r && r.expanded) next = activeRow + 1
        break
      case 'ArrowLeft':
        if (r && r.expanded && !treeFilter) {
          e.preventDefault()
          toggle(r.entry.id)
          return
        }
        if (r && r.entry.parentId !== null) {
          const p = treeRows.findIndex((x) => x.entry.id === r.entry.parentId)
          if (p >= 0) next = p
        }
        break
      case 'Enter':
      case ' ':
        if (r) {
          e.preventDefault()
          send({ type: 'highlight', id: r.entry.id })
        }
        return
      default:
        return
    }
    e.preventDefault()
    const target = treeRows[next]
    if (target) {
      activeRow = next
      select(target.entry.id)
    }
  })

  function kv(rows: [string, Node | string][]): HTMLDListElement {
    const dl = el('dl', { class: 'kv' })
    for (const [k, v] of rows) dl.append(el('dt', { text: k }), el('dd', {}, v))
    return dl
  }

  function renderInspector(): void {
    const entry = selectedId === null ? undefined : index.map.get(selectedId)
    if (!entry) {
      inspector.replaceChildren(
        el('div', { class: 'pane-h' }, 'inspector'),
        el('div', { class: 'empty2', text: detected ? 'Select a component to inspect it.' : 'Waiting for a Pyreon app on this page…' }),
      )
      return
    }
    const path = ownerPath(entry.id, index.map)
    const shownPath = path.length > 5 ? ['…', ...path.slice(-4)] : path
    const kids = index.children.get(entry.id) ?? []
    const nodes: Node[] = [
      el(
        'div',
        { class: 'pane-h' },
        el('span', { class: 'ins-name', text: entry.name }),
        el('span', { class: 'sp' }),
        el('span', { class: 'chip2 ok', title: 'A Pyreon component function runs once per mount', text: 'runs: 1' }),
      ),
      kv([
        ['owner', shownPath.join(' › ')],
        ['id', entry.id],
        ['children', kids.length === 0 ? 'none' : plural(kids.length, 'component')],
      ]),
      el('div', { class: 'sec-h', text: 'reactive reads' }),
    ]
    if (!reactiveAvailable) {
      nodes.push(el('p', { class: 'note', text: 'Needs a framework build with the reactive devtools bridge.' }))
    } else if (!detail || detail.id !== entry.id) {
      nodes.push(el('p', { class: 'note', text: 'Reading…' }))
    } else if (!detail.hasElement) {
      nodes.push(el('p', { class: 'note', text: 'This component rendered no element, so there is no text to trace.' }))
    } else if (detail.reads.length === 0) {
      nodes.push(el('p', { class: 'note', text: 'No signal or computed is rendered as text inside this component.' }))
    } else {
      nodes.push(
        el('p', { class: 'note', text: 'Signals and computeds rendered as text inside this component (attribute bindings are not traced).' }),
        kv(
          detail.reads.map((r) => [
            displayName(r.name, r.loc),
            `${r.kind === 'derived' ? 'computed' : r.kind} · ${plural(r.fires, 'write')} · ${r.value}`,
          ]),
        ),
      )
    }
    nodes.push(el('div', { class: 'sec-h', text: 'why did this update?' }))
    const why = el('div', { class: 'why' })
    if (detail && detail.id === entry.id && detail.cause) {
      const v = causeView(detail.cause)
      if (v.truncated) why.append(el('span', { class: 'dim', text: '… ' }))
      v.steps.forEach((s, i) => {
        if (i > 0) why.append(el('span', { class: 'ar', text: ' → ' }))
        why.append(el('b', { text: s.name }), ` ${s.kind === 'derived' ? 'computed' : s.kind} ${s.verb}`)
        if (s.where) why.append(el('span', { class: 'dim', text: ` (${s.where})` }))
      })
      const lastFire = detail.reads.reduce<number | null>(
        (m, r) => (r.lastFire !== null && (m === null || r.lastFire > m) ? r.lastFire : m),
        null,
      )
      why.append(el('div', { class: 'why-foot', text: `${formatAgo(lastFire, detail.now)} · the component itself did not re-run` }))
    } else {
      why.append('Mounted once. Nothing it renders as text has updated since.')
    }
    nodes.push(why)
    inspector.replaceChildren(...nodes)
  }

  // ── Graph view ──────────────────────────────────────────────────────
  const scopeBtns = (['selected', 'everything'] as const).map((s) => {
    const b = el('button', { type: 'button', 'aria-pressed': String(s === graphScope) }, s === 'selected' ? 'Selected' : 'Everything')
    on(b, 'click', () => {
      graphScope = s
      for (const [i, x] of scopeBtns.entries()) x.setAttribute('aria-pressed', String((i === 0 ? 'selected' : 'everything') === s))
      renderGraph()
    })
    return b
  })
  const graphCaption = el('span', { class: 'cap' })
  const graphSvg = svg('svg', { role: 'img', 'aria-label': 'Reactive dependency graph' })
  const graphEmpty = el('div', { class: 'empty2', hidden: true })
  const graphView = el(
    'div',
    { class: 'pane' },
    el(
      'div',
      { class: 'pane-h' },
      'reactive graph',
      el('span', { class: 'sp' }),
      graphCaption,
      el('span', { class: 'seg2', role: 'group', 'aria-label': 'Scope' }, ...scopeBtns),
    ),
    el(
      'div',
      { class: 'dt-graph' },
      graphEmpty,
      graphSvg,
      el(
        'div',
        { class: 'dt-legend' },
        el('span', {}, el('i', { class: 'lg s' }), 'signal'),
        el('span', {}, el('i', { class: 'lg c' }), 'computed'),
        el('span', {}, el('i', { class: 'lg e' }), 'effect'),
        el('span', {}, el('i', { class: 'lg f' }), 'fired in the last write'),
      ),
    ),
  )

  function graphFocus(): { ids: number[]; label: string } {
    if (selectedNode !== null && nodeInfo.has(selectedNode)) {
      return { ids: [selectedNode], label: nodeInfo.get(selectedNode)?.name ?? '' }
    }
    if (selectedId !== null && detail && detail.id === selectedId && detail.reads.length > 0) {
      return { ids: detail.reads.map((r) => r.id), label: index.map.get(selectedId)?.name ?? '' }
    }
    const last = Array.from(lastCascadeIds(fires))
    if (last.length > 0) return { ids: last, label: 'the last write' }
    return { ids: [], label: '' }
  }

  function renderGraph(): void {
    if (!reactiveAvailable) return
    let scoped
    let caption: string
    if (graphScope === 'everything') {
      scoped = everythingScope(graph, GRAPH_CAP)
      caption = scoped.total > scoped.graph.nodes.length ? `showing ${scoped.graph.nodes.length} of ${plural(scoped.total, 'node')}, most active first` : plural(scoped.total, 'node')
    } else {
      const focus = graphFocus()
      scoped = selectedScope(graph, focus.ids, GRAPH_CAP)
      caption = focus.ids.length === 0 ? '' : `around ${focus.label}${scoped.total > scoped.graph.nodes.length ? ` · showing ${scoped.graph.nodes.length} of ${scoped.total}` : ''}`
    }
    graphCaption.textContent = caption
    if (scoped.graph.nodes.length === 0) {
      graphSvg.style.display = 'none'
      graphEmpty.hidden = false
      graphEmpty.textContent =
        graph.nodes.length === 0
          ? 'No signals yet.'
          : 'Nothing selected. Pick a signal in Signals, a component in Components, or switch to Everything.'
      return
    }
    graphSvg.style.display = ''
    graphEmpty.hidden = true
    const laid = layoutGraph(scoped.graph)
    const firedLast = lastCascadeIds(fires)
    graphSvg.setAttribute('viewBox', `0 0 ${laid.width} ${laid.height}`)
    // Never upscale: 12 px labels stay 12 px on a wide panel.
    graphSvg.style.maxWidth = `${laid.width}px`
    graphSvg.setAttribute(
      'aria-label',
      `Reactive dependency graph: ${plural(laid.nodes.length, 'node')}, ${plural(laid.edges.length, 'edge')}`,
    )
    const pos = new Map(laid.nodes.map((n) => [n.id, n]))
    const parts: SVGElement[] = []
    for (const e of laid.edges) {
      const a = pos.get(e.from)
      const b = pos.get(e.to)
      if (!a || !b) continue
      const x1 = a.x + NODE_W
      const y1 = a.y + NODE_H / 2
      const x2 = b.x
      const y2 = b.y + NODE_H / 2
      const fired = firedLast.has(e.from) && firedLast.has(e.to)
      parts.push(
        svg('path', {
          class: fired ? 'f' : null,
          d: `M${x1} ${y1} C${x1 + 60} ${y1},${x2 - 60} ${y2},${x2} ${y2}`,
        }),
      )
    }
    for (const n of laid.nodes) {
      const k = n.kind === 'signal' ? 'gs' : n.kind === 'derived' ? 'gc' : 'ge'
      const g = svg('g', { class: `gn ${k}${firedLast.has(n.id) ? ' gf' : ''}` })
      const title = svg('title')
      title.textContent = `${n.name} (${n.kind === 'derived' ? 'computed' : n.kind}) · ${plural(n.fires, 'fire')}`
      g.append(
        title,
        svg('rect', { x: n.x, y: n.y, width: NODE_W, height: NODE_H, rx: 8 }),
      )
      const text = svg('text', { x: n.x + 12, y: n.y + 20 })
      text.textContent = n.name.length > 17 ? `${n.name.slice(0, 16)}…` : n.name
      g.append(text)
      parts.push(g)
    }
    graphSvg.replaceChildren(...parts)
  }

  // ── Signals view ────────────────────────────────────────────────────
  const sigFilterInput = el('input', { type: 'search', placeholder: 'Filter', 'aria-label': 'Filter signals' })
  const sigCaption = el('span', { class: 'cap' })
  const sigScroller = el('div', { class: 'v-scroll', tabindex: 0, role: 'rowgroup' })
  const sigEmpty = el('div', { class: 'empty2', hidden: true })
  const header = el(
    'div',
    { class: 'sig-row head', role: 'row' },
    el('span', { role: 'columnheader', text: 'name' }),
    el('span', { role: 'columnheader', text: 'value' }),
    el('span', { role: 'columnheader', class: 'num', text: 'subs' }),
    el('span', { role: 'columnheader', class: 'num', text: 'writes' }),
    el('span', { role: 'columnheader', class: 'lw', text: 'last write' }),
  )
  const sigGrid = el(
    'div',
    { class: 'sig-grid', role: 'grid', 'aria-label': 'Signals and computeds' },
    el('div', { role: 'rowgroup' }, header),
    sigScroller,
  )
  const signalsView = el(
    'div',
    { class: 'pane pane-col' },
    el('div', { class: 'pane-h' }, 'signals', el('span', { class: 'sp' }), sigCaption, sigFilterInput),
    sigEmpty,
    sigGrid,
  )
  let sigActive = 0
  const sigRowId = (i: number): string => `pd-sr-${i}`
  const sigList = virtualList(
    sigScroller,
    SIGNAL_ROW_H,
    () => sigRows.length,
    (i) => {
      const n = sigRows[i] as ReactiveNode
      const hotRow = n.lastFire !== null && pageNow - n.lastFire < 1500
      const row = el(
        'div',
        {
          class: `sig-row${hotRow ? ' hot' : ''}${i === sigActive ? ' active' : ''}`,
          role: 'row',
          id: sigRowId(i),
          'aria-rowindex': i + 2,
          'aria-selected': n.id === selectedNode ? 'true' : 'false',
        },
        el(
          'span',
          { role: 'gridcell', class: 't' },
          el('span', { text: n.name }),
          n.kind === 'derived' ? el('span', { class: 'kind', text: 'computed' }) : null,
        ),
        el('span', { role: 'gridcell', class: 'v', text: n.value }),
        el('span', { role: 'gridcell', class: 'num', text: String(n.subscribers) }),
        el('span', { role: 'gridcell', class: 'num', text: String(n.fires) }),
        el('span', { role: 'gridcell', class: 'lw dim', text: formatAgo(n.lastFire, pageNow) }),
      )
      row.dataset.index = String(i)
      return row
    },
  )
  on(sigScroller, 'click', (e) => {
    const row = (e.target as Element).closest<HTMLElement>('.sig-row')
    const n = row ? sigRows[Number(row.dataset.index)] : undefined
    if (!row || !n) return
    sigActive = Number(row.dataset.index)
    selectNode(n.id)
    sigScroller.focus({ preventScroll: true })
  })
  sigGrid.setAttribute('aria-rowcount', '1')

  function selectNode(id: number): void {
    selectedNode = selectedNode === id ? null : id
    sigList.refresh()
  }

  on(sigScroller, 'keydown', (e) => {
    if (sigRows.length === 0) return
    let next = sigActive
    if (e.key === 'ArrowDown') next = Math.min(sigRows.length - 1, sigActive + 1)
    else if (e.key === 'ArrowUp') next = Math.max(0, sigActive - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = sigRows.length - 1
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const n = sigRows[sigActive]
      if (n) selectNode(n.id)
      return
    } else return
    e.preventDefault()
    sigActive = next
    sigScroller.setAttribute('aria-activedescendant', sigRowId(next))
    sigList.reveal(next)
  })

  on(sigFilterInput, 'input', () => {
    signalFilter = sigFilterInput.value
    sigActive = 0
    sigScroller.scrollTop = 0
    renderSignals()
  })

  function renderSignals(): void {
    if (!reactiveAvailable) return
    sigRows = signalRows(graph, signalFilter)
    const total = graph.nodes.length - countKinds(graph).effect
    sigCaption.textContent = signalFilter ? `${sigRows.length.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}` : ''
    sigGrid.setAttribute('aria-rowcount', String(sigRows.length + 1))
    if (sigActive >= sigRows.length) sigActive = Math.max(0, sigRows.length - 1)
    sigScroller.setAttribute('aria-activedescendant', sigRows.length ? sigRowId(sigActive) : '')
    sigEmpty.hidden = sigRows.length > 0
    sigEmpty.textContent = total === 0 ? 'No signals yet.' : `No signal matches "${signalFilter}".`
    sigList.refresh()
  }

  // ── Effects view ────────────────────────────────────────────────────
  const lanesHost = el('div', { class: 'lanes', role: 'list' })
  const lanesNote = el('p', { class: 'note', hidden: true })
  const effectsView = el(
    'div',
    { class: 'pane' },
    el('div', { class: 'pane-h', text: 'effects · fire lanes (last 10 s)' }),
    lanesNote,
    lanesHost,
  )

  function renderEffects(): void {
    if (!reactiveAvailable) return
    const res = effectLanes(graph, fires, pageNow, 10_000, LANE_CAP)
    const notes: string[] = []
    if (res.total > res.lanes.length) notes.push(`Showing ${res.lanes.length} of ${res.total} effects, busiest first.`)
    if (res.ringFull) notes.push('The page keeps its last 512 fires, so busy effects may show fewer ticks than they ran.')
    lanesNote.hidden = notes.length === 0
    lanesNote.textContent = notes.join(' ')
    if (res.lanes.length === 0) {
      lanesHost.replaceChildren(el('div', { class: 'empty2', text: 'No effect ran in the last 10 seconds. Use the app and lanes appear here.' }))
      return
    }
    lanesHost.replaceChildren(
      ...res.lanes.map((l) => {
        const track = el('div', { class: 'lt', 'aria-hidden': 'true' })
        for (const t of l.ticks) {
          const tick = el('i')
          tick.style.left = `calc(${(t * 100).toFixed(2)}% - 1.5px)`
          track.append(tick)
        }
        const reads = l.reads.length ? `reads ${l.reads.slice(0, 3).join(', ')}${l.reads.length > 3 ? ` +${l.reads.length - 3}` : ''} · ` : ''
        return el(
          'div',
          { class: 'lane', role: 'listitem' },
          el(
            'div',
            { class: 'ln' },
            el('b', { text: l.name }),
            el('span', { text: `${reads}${l.windowFires} in 10 s · ${l.fires.toLocaleString('en-US')} total` }),
          ),
          track,
        )
      }),
    )
  }

  // ── Profiler view ───────────────────────────────────────────────────
  const recBtn = el('button', { type: 'button', class: 'ib', 'aria-pressed': 'false', 'aria-label': 'Record', title: 'Record' }, icon(ICON_RECORD))
  const profClearBtn = el('button', { type: 'button', class: 'ib', 'aria-label': 'Clear recording', title: 'Clear recording' }, icon(ICON_CLEAR))
  const sumCells = [0, 1, 2, 3].map(() => el('b', { text: '—' }))
  const sumLabels = ['updates', 'fires', 'effect runs', 'longest batch']
  const profSum = el('div', { class: 'prof-sum' }, ...sumCells.map((b, i) => el('div', {}, b, el('span', { text: sumLabels[i] }))))
  const profNote = el('p', { class: 'note', hidden: true })
  const profBars = el('div', { class: 'prof-bars', role: 'list', 'aria-label': 'Recorded batches, newest first' })
  const profilerView = el(
    'div',
    { class: 'pane' },
    el('div', { class: 'pane-h' }, 'profiler', el('span', { class: 'sp' }), profClearBtn, recBtn),
    el('div', { class: 'prof' }, profSum, profNote, profBars),
  )

  function setRecording(active: boolean): void {
    recording = active
    recBtn.setAttribute('aria-pressed', String(active))
    recBtn.setAttribute('aria-label', active ? 'Stop recording' : 'Record')
    recBtn.title = active ? 'Stop recording' : 'Record'
    if (recordTimer !== null) clearInterval(recordTimer)
    recordTimer = null
    if (active) {
      recorder = createRecorder()
      recordBaselinePending = true
      send({ type: 'reactive-poll', graph: false })
      recordTimer = setInterval(() => send({ type: 'reactive-poll', graph: false }), recordPollMs)
    }
    renderProfiler()
  }
  on(recBtn, 'click', () => setRecording(!recording))
  on(profClearBtn, 'click', () => {
    recorder = createRecorder()
    if (recording) recordBaselinePending = true
    renderProfiler()
  })

  function renderProfiler(): void {
    if (!reactiveAvailable) return
    const batches = recorder.batches
    const s = summarize(batches)
    const started = recording || batches.length > 0
    ;(sumCells[0] as HTMLElement).textContent = started ? s.updates.toLocaleString('en-US') : '—'
    ;(sumCells[1] as HTMLElement).textContent = started ? s.fires.toLocaleString('en-US') : '—'
    ;(sumCells[2] as HTMLElement).textContent = started ? s.effectRuns.toLocaleString('en-US') : '—'
    ;(sumCells[3] as HTMLElement).textContent = started ? formatSpan(s.longest) : '—'
    const notes: string[] = []
    if (recorder.gaps > 0) notes.push(`${plural(recorder.gaps, 'poll')} found the page's 512-fire buffer had wrapped: some batches are missing.`)
    if (batches.length > PROFILER_ROWS_CAP) notes.push(`Showing the newest ${PROFILER_ROWS_CAP} of ${batches.length.toLocaleString('en-US')} batches.`)
    profNote.hidden = notes.length === 0
    profNote.textContent = notes.join(' ')
    if (batches.length === 0) {
      profBars.replaceChildren(
        el('div', {
          class: 'empty2',
          text: recording
            ? 'Recording. Use the app: every batch shows up here with the change that started it.'
            : 'Press record, then use the app. Every batch shows up here with the change that started it: bars show how many nodes it touched, times run from its first to its last fire.',
        }),
      )
      return
    }
    // Bars: how many nodes a batch touched. Times are first-to-last fire,
    // limited by the page clock's resolution (100 µs unless cross-origin
    // isolated), so most single batches read "< 0.1 ms".
    let maxFires = 1
    for (const b of batches) if (b.fires > maxFires) maxFires = b.fires
    const rows: HTMLElement[] = []
    for (let i = batches.length - 1; i >= Math.max(0, batches.length - PROFILER_ROWS_CAP); i--) {
      const b = batches[i] as Batch
      const bar = el('i', { 'aria-hidden': 'true' })
      bar.style.width = `${Math.max(3, (b.fires / maxFires) * 100)}%`
      rows.push(
        el('div', { class: 'pb', role: 'listitem' }, el('span', { text: batchLabel(b) }), bar, el('b', { text: formatSpan(b.end - b.start) })),
      )
    }
    profBars.replaceChildren(...rows)
  }

  // ── Console view ────────────────────────────────────────────────────
  const logHost = el('div', { class: 'log2', role: 'log', 'aria-label': 'Pyreon warnings and errors' })
  const conClearBtn = el('button', { type: 'button', class: 'ib', 'aria-label': 'Clear console', title: 'Clear console' }, icon(ICON_CLEAR))
  const evalInput = el('input', {
    type: 'text',
    class: 'eval',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Evaluate in the page',
    placeholder: 'Evaluate in the page, e.g. $p.stats()',
  })
  const consoleView = el(
    'div',
    { class: 'pane pane-col' },
    el('div', { class: 'pane-h' }, 'console', el('span', { class: 'sp' }), conClearBtn),
    el('div', { class: 'con-scroll' }, logHost),
    el('div', { class: 'eval-row' }, el('span', { class: 'acc', 'aria-hidden': 'true', text: '›' }), evalInput),
  )
  on(conClearBtn, 'click', () => {
    logLines = []
    send({ type: 'console-clear' })
    renderConsole()
  })
  on(evalInput, 'keydown', (e) => {
    if (e.key !== 'Enter') return
    const expr = evalInput.value.trim()
    if (!expr) return
    evalInput.value = ''
    pushLog({ time: Date.now(), kind: 'in', text: expr })
    send({ type: 'reactive-eval', expr })
  })

  function pushLog(line: (typeof logLines)[number]): void {
    logLines.push(line)
    if (logLines.length > CONSOLE_LINES_CAP) logLines.splice(0, logLines.length - CONSOLE_LINES_CAP)
    renderConsole()
  }

  function renderConsole(): void {
    const warnings = logLines.filter((l) => l.kind === 'warn' || l.kind === 'error').length
    ;(tabCounts.get('console') as HTMLElement).textContent = warnings > 0 ? String(warnings) : ''
    if (activeTab !== 'console') return
    if (logLines.length === 0) {
      logHost.replaceChildren(
        el('div', {
          class: 'empty2',
          text: 'No [Pyreon] warnings or errors since this panel opened. Type below to evaluate in the page.',
        }),
      )
      return
    }
    const sym = { warn: ['!', 'warnc'], error: ['✗', 'errc'], in: ['›', 'acc'], out: ['‹', 'linkc'] } as const
    logHost.replaceChildren(
      ...logLines.map((l) =>
        el(
          'div',
          { class: `ll ${l.kind}` },
          el('span', { class: 'time', text: clock(l.time) }),
          el('span', { class: sym[l.kind][1], 'aria-label': l.kind, text: sym[l.kind][0] }),
          l.kind === 'warn' || l.kind === 'error' ? messageNode(l.text) : el('span', { class: 'msg', text: l.text }),
        ),
      ),
    )
    const scroller = logHost.parentElement
    if (scroller) scroller.scrollTop = scroller.scrollHeight
  }

  // ── Mount views ─────────────────────────────────────────────────────
  const viewEls: Record<TabId, HTMLElement> = {
    components: componentsView,
    graph: graphView,
    signals: signalsView,
    effects: effectsView,
    profiler: profilerView,
    console: consoleView,
  }
  const needs: HTMLElement[] = []
  const body = el('div', { class: 'app-body' })
  for (const t of TABS) {
    const section = el('section', {
      class: 'dt-view',
      role: 'tabpanel',
      id: `pd-view-${t.id}`,
      'aria-labelledby': `pd-tab-${t.id}`,
      'data-view': t.id,
      hidden: t.id !== activeTab,
    })
    if (t.id !== 'components' && t.id !== 'console') {
      const n = el('div', { class: 'callout2', hidden: true })
      needs.push(n)
      section.append(n)
    }
    section.append(viewEls[t.id])
    views.set(t.id, section)
    body.append(section)
  }
  body.append(status)
  const app = el('div', { class: 'app' }, top, body)
  root.replaceChildren(app)

  function setTab(tab: TabId): void {
    const wasReactive = activeTab !== 'components' && activeTab !== 'console'
    activeTab = tab
    const isReactive = tab !== 'components' && tab !== 'console'
    // Entering a reactive tab: fetch now rather than on the next tick.
    if (isReactive && !wasReactive && reactiveAvailable) send({ type: 'reactive-poll' })
    for (const [id, b] of tabButtons) {
      b.setAttribute('aria-selected', String(id === tab))
      b.tabIndex = id === tab ? 0 : -1
    }
    for (const [id, v] of views) v.hidden = id !== tab
    renderActive()
  }

  function renderActive(): void {
    switch (activeTab) {
      case 'components':
        treeList.refresh()
        renderInspector()
        break
      case 'graph':
        renderGraph()
        break
      case 'signals':
        renderSignals()
        break
      case 'effects':
        renderEffects()
        break
      case 'profiler':
        renderProfiler()
        break
      case 'console':
        renderConsole()
        break
    }
  }

  function renderStatus(): void {
    stDot.className = connected && detected ? 'on' : ''
    ;(stConn.lastChild as HTMLElement).textContent = !connected
      ? 'disconnected · reopen DevTools to reconnect'
      : detected
        ? `connected${host ? ` · ${host}` : ''}`
        : 'looking for a Pyreon app…'
    stComponents.textContent = plural(entries.length, 'component')
    const c = countKinds(graph)
    stSignals.textContent = reactiveAvailable ? `${plural(c.signal, 'signal')} · ${plural(c.derived, 'computed', 'computeds')}` : ''
    stEffects.textContent = reactiveAvailable ? plural(c.effect, 'effect') : ''
    ;(tabCounts.get('signals') as HTMLElement).textContent = reactiveAvailable ? (c.signal + c.derived).toLocaleString('en-US') : ''
    ;(tabCounts.get('effects') as HTMLElement).textContent = reactiveAvailable ? c.effect.toLocaleString('en-US') : ''
  }

  function setReactive(available: boolean): void {
    reactiveAvailable = available
    const show = detected && available
    for (const n of needs) {
      n.hidden = show
      if (!detected) {
        n.replaceChildren('Waiting for a Pyreon app on this page…')
      } else if (!available) {
        n.replaceChildren(
          el('b', { text: 'This tab needs the reactive devtools bridge. ' }),
          'The page runs a @pyreon/runtime-dom without __PYREON_DEVTOOLS__.reactive. Upgrade it and reload; Components and Console work either way.',
        )
      }
    }
    for (const t of ['graph', 'signals', 'effects', 'profiler'] as TabId[]) {
      viewEls[t].hidden = !show
    }
  }

  // ── Messages ────────────────────────────────────────────────────────
  transport.onMessage((msg) => {
    switch (msg.type) {
      case 'pyreon-detected': {
        if (noResponseTimer !== null) clearTimeout(noResponseTimer)
        noResponseTimer = null
        detected = true
        host = msg.host
        setReactive(msg.reactive)
        if (msg.reactive) send({ type: 'reactive-activate' })
        send({ type: 'get-all' })
        send({ type: 'console-subscribe' })
        if (msg.reactive) send({ type: 'reactive-poll' })
        startPolling()
        renderStatus()
        rebuildTree()
        renderActive()
        break
      }
      case 'all-result': {
        const first = entries.length === 0
        entries = msg.entries
        index = indexTree(entries)
        if (first) autoExpand()
        if (selectedId !== null && !index.map.has(selectedId)) {
          selectedId = null
          detail = null
        }
        rebuildTree()
        renderStatus()
        if (activeTab === 'components') renderInspector()
        break
      }
      case 'components-changed': {
        const now = Date.now()
        for (const id of msg.mounted) hot.set(id, now)
        for (const id of msg.unmounted) hot.delete(id)
        // One timer at a time: it expires every pulse older than HOT_MS
        // and re-arms itself while any remain, so `hot` drains to empty.
        const expire = (): void => {
          hotTimer = null
          const cut = Date.now() - HOT_MS
          for (const [id, t] of hot) if (t <= cut) hot.delete(id)
          treeList.refresh()
          if (hot.size > 0) hotTimer = setTimeout(expire, HOT_MS)
        }
        if (hot.size > 0 && hotTimer === null) hotTimer = setTimeout(expire, HOT_MS + 50)
        send({ type: 'get-all' })
        break
      }
      case 'reactive-snapshot': {
        pageNow = msg.now
        fires = msg.fires
        if (msg.graph) {
          graph = withDisplayNames(msg.graph)
          nodeInfo.clear()
          for (const n of graph.nodes) nodeInfo.set(n.id, { name: n.name, kind: n.kind })
          if (selectedNode !== null && !nodeInfo.has(selectedNode)) selectedNode = null
          renderStatus()
        }
        if (recording) {
          if (recordBaselinePending) {
            recordBaselinePending = false
            recorder.lastTs = msg.now
          } else {
            ingestFires(recorder, msg.fires, (id) => nodeInfo.get(id))
          }
        }
        if (activeTab !== 'components' && activeTab !== 'console') renderActive()
        break
      }
      case 'component-detail': {
        if (msg.detail.id !== selectedId) break
        detail = msg.detail
        if (activeTab === 'components') renderInspector()
        break
      }
      case 'console-entries': {
        if (msg.reset) logLines = logLines.filter((l) => l.kind === 'in' || l.kind === 'out')
        for (const e of msg.entries as ConsoleEntry[]) logLines.push({ time: e.time, kind: e.level, text: e.text })
        logLines.sort((a, b) => a.time - b.time)
        if (logLines.length > CONSOLE_LINES_CAP) logLines.splice(0, logLines.length - CONSOLE_LINES_CAP)
        renderConsole()
        break
      }
      case 'reactive-eval-result': {
        pushLog({ time: Date.now(), kind: msg.ok ? 'out' : 'error', text: msg.result })
        break
      }
    }
  })

  transport.onDisconnect(() => {
    connected = false
    stopPolling()
    renderStatus()
  })

  function startPolling(): void {
    if (pollTimer !== null) return
    let ticks = 0
    pollTimer = setInterval(() => {
      ticks++
      // The reactive tabs need a fresh graph every tick; elsewhere it only
      // feeds the tab counts and the status bar, so every fifth tick.
      const reactiveTab = activeTab !== 'components' && activeTab !== 'console'
      if (reactiveAvailable && (reactiveTab || ticks % 5 === 0)) send({ type: 'reactive-poll' })
      if (activeTab === 'components' && selectedId !== null) send({ type: 'inspect', id: selectedId })
    }, pollMs)
  }

  function stopPolling(): void {
    if (pollTimer !== null) clearInterval(pollTimer)
    if (recordTimer !== null) clearInterval(recordTimer)
    pollTimer = null
    recordTimer = null
  }

  // ── Boot ────────────────────────────────────────────────────────────
  setReactive(false)
  renderStatus()
  rebuildTree()
  renderInspector()
  send({ type: 'hello' })
  noResponseTimer = setTimeout(() => {
    noResponseTimer = null
    if (!detected) {
      treeEmpty.hidden = false
      treeEmpty.textContent =
        'No Pyreon app found on this page. The hook appears on the first mount() of a development build; reload the page if it mounted before DevTools opened.'
    }
  }, 3000)

  return {
    setTheme(theme) {
      root.dataset.theme = theme
    },
    selectTab: setTab,
    dispose() {
      stopPolling()
      if (noResponseTimer !== null) clearTimeout(noResponseTimer)
      if (hotTimer !== null) clearTimeout(hotTimer)
      hot.clear()
      listeners.abort()
      treeList.dispose()
      sigList.dispose()
      root.replaceChildren()
    },
  }
}
