/**
 * In-page counter overlay.
 *
 * Mounts a draggable floating panel into a shadow root so its styles can't
 * bleed into the host app (and vice versa). Refreshes on requestAnimationFrame
 * while visible; sleeps when hidden. Self-unmounts if called twice on the same
 * window (last one wins).
 *
 * Not a framework component — plain DOM. Keeps the harness usable from
 * non-Pyreon pages (the docs site, another framework's app, an iframe).
 */

import type { CounterName } from './counters'
import { _reset, _snapshot } from './counters'
import { perfHarness } from './harness'

export interface OverlayOptions {
  /** Host element for the shadow root. Defaults to a new `<div>` appended to `document.body`. */
  container?: HTMLElement
  /** Initial visibility — when false the overlay mounts hidden and waits for the keybind. */
  visible?: boolean
  /** Package prefix filters shown in the header. */
  packages?: string[]
}

export interface OverlayHandle {
  show: () => void
  hide: () => void
  toggle: () => void
  destroy: () => void
  isVisible: () => boolean
}

const DEFAULT_PACKAGES = [
  'styler',
  'unistyle',
  'rocketstyle',
  'runtime',
  'reactivity',
  'router',
]

// One overlay per window. Re-calling overlay() destroys the previous one.
interface PerfWindow {
  __pyreon_perf_overlay__?: OverlayHandle
}

export function mountOverlay(options: OverlayOptions = {}): OverlayHandle {
  const w = globalThis as unknown as PerfWindow
  if (w.__pyreon_perf_overlay__) w.__pyreon_perf_overlay__.destroy()

  const host = options.container ?? document.createElement('div')
  host.setAttribute('data-pyreon-perf-overlay-host', '')
  if (!options.container) document.body.appendChild(host)

  const root = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = CSS
  root.appendChild(style)

  const panel = document.createElement('div')
  panel.className = 'panel'
  panel.innerHTML = TEMPLATE
  root.appendChild(panel)

  const titleBar = panel.querySelector('.titlebar') as HTMLElement
  const tbody = panel.querySelector('tbody') as HTMLElement
  const emptyMsg = panel.querySelector('.empty') as HTMLElement
  const filterBar = panel.querySelector('.filters') as HTMLElement
  const btnReset = panel.querySelector('.btn-reset') as HTMLButtonElement
  const btnRecord = panel.querySelector('.btn-record') as HTMLButtonElement
  const btnExport = panel.querySelector('.btn-export') as HTMLButtonElement
  const btnClose = panel.querySelector('.btn-close') as HTMLButtonElement
  const statusEl = panel.querySelector('.status') as HTMLElement

  // ── Filter chips ───────────────────────────────────────────────────────────
  const packages = options.packages ?? DEFAULT_PACKAGES
  const activeFilters = new Set(packages)
  for (const pkg of packages) {
    const chip = document.createElement('button')
    chip.className = 'chip chip-on'
    chip.textContent = pkg
    chip.addEventListener('click', () => {
      if (activeFilters.has(pkg)) {
        activeFilters.delete(pkg)
        chip.classList.remove('chip-on')
      } else {
        activeFilters.add(pkg)
        chip.classList.add('chip-on')
      }
      render()
    })
    filterBar.appendChild(chip)
  }

  // ── Drag ───────────────────────────────────────────────────────────────────
  let dragDx = 0
  let dragDy = 0
  titleBar.addEventListener('pointerdown', (ev) => {
    const rect = panel.getBoundingClientRect()
    dragDx = ev.clientX - rect.left
    dragDy = ev.clientY - rect.top
    const move = (mv: PointerEvent) => {
      panel.style.left = `${mv.clientX - dragDx}px`
      panel.style.top = `${mv.clientY - dragDy}px`
      panel.style.right = 'auto'
      panel.style.bottom = 'auto'
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  })

  // ── Rendering ──────────────────────────────────────────────────────────────
  let rafId = 0
  let visible = options.visible !== false
  let recording = false
  const rowEls = new Map<CounterName, { tr: HTMLTableRowElement; val: HTMLElement }>()

  const render = () => {
    const snap = _snapshot()
    const names = Object.keys(snap)
      .filter((n) => {
        const prefix = n.split('.')[0] ?? ''
        return activeFilters.has(prefix)
      })
      .sort((a, b) => (snap[b] ?? 0) - (snap[a] ?? 0))

    if (names.length === 0) {
      emptyMsg.style.display = 'block'
    } else {
      emptyMsg.style.display = 'none'
    }

    // Remove rows that no longer match filters
    for (const [name, row] of rowEls) {
      if (!names.includes(name)) {
        row.tr.remove()
        rowEls.delete(name)
      }
    }

    // Add/update rows in sorted order
    for (const name of names) {
      let row = rowEls.get(name)
      if (!row) {
        const tr = document.createElement('tr')
        const td1 = document.createElement('td')
        td1.className = 'name'
        td1.textContent = name
        const td2 = document.createElement('td')
        td2.className = 'value'
        tr.appendChild(td1)
        tr.appendChild(td2)
        tbody.appendChild(tr)
        row = { tr, val: td2 }
        rowEls.set(name, row)
      }
      const v = snap[name] ?? 0
      if (row.val.textContent !== String(v)) row.val.textContent = String(v)
    }

    // Re-order rows to match sort. Move each in sequence; O(n) for a handful.
    for (const name of names) {
      const row = rowEls.get(name)
      if (row) tbody.appendChild(row.tr)
    }
  }

  const loop = () => {
    if (!visible) return
    render()
    rafId = requestAnimationFrame(loop)
  }

  // ── Buttons ────────────────────────────────────────────────────────────────
  btnReset.addEventListener('click', () => {
    _reset()
    statusEl.textContent = 'reset'
  })

  btnRecord.addEventListener('click', async () => {
    if (recording) return
    recording = true
    btnRecord.textContent = '● recording'
    btnRecord.classList.add('recording')
    const outcome = await perfHarness.record('overlay-manual', async () => {
      // Hold recording for 5s — user clicks again to stop. We use a promise
      // that resolves on the next click.
      await new Promise<void>((resolve) => {
        const onClick = () => {
          btnRecord.removeEventListener('click', onClick)
          resolve()
        }
        btnRecord.addEventListener('click', onClick, { once: true })
      })
    })
    recording = false
    btnRecord.textContent = 'record'
    btnRecord.classList.remove('recording')
    statusEl.textContent = `recorded: ${outcome.diff.entries.length} counters`
    // eslint-disable-next-line no-console
    console.log('[pyreon-perf] recorded:', outcome)
  })

  btnExport.addEventListener('click', () => {
    const snap = _snapshot()
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pyreon-perf-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    statusEl.textContent = 'exported'
  })

  btnClose.addEventListener('click', () => hide())

  // ── Visibility ─────────────────────────────────────────────────────────────
  const show = () => {
    if (visible) return
    visible = true
    panel.style.display = 'flex'
    loop()
  }
  const hide = () => {
    if (!visible) return
    visible = false
    panel.style.display = 'none'
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
  }
  const toggle = () => (visible ? hide() : show())
  const isVisible = () => visible

  // ── Keybind ────────────────────────────────────────────────────────────────
  const onKey = (ev: KeyboardEvent) => {
    if (ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === 'p') {
      ev.preventDefault()
      toggle()
    }
  }
  window.addEventListener('keydown', onKey)

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  const destroy = () => {
    if (rafId) cancelAnimationFrame(rafId)
    window.removeEventListener('keydown', onKey)
    if (!options.container) host.remove()
    else {
      while (root.firstChild) root.removeChild(root.firstChild)
    }
    rowEls.clear()
    delete w.__pyreon_perf_overlay__
  }

  const handle: OverlayHandle = { show, hide, toggle, destroy, isVisible }
  w.__pyreon_perf_overlay__ = handle

  if (visible) loop()
  else panel.style.display = 'none'

  return handle
}

// ─── Markup + CSS ────────────────────────────────────────────────────────────

const TEMPLATE = `
<div class="titlebar">
  <span class="title">pyreon · perf</span>
  <div class="titlebar-actions">
    <button class="btn-close" aria-label="close">×</button>
  </div>
</div>
<div class="filters"></div>
<div class="scroll">
  <div class="empty">no counters recorded</div>
  <table>
    <thead><tr><th>metric</th><th>value</th></tr></thead>
    <tbody></tbody>
  </table>
</div>
<div class="footer">
  <button class="btn-reset">reset</button>
  <button class="btn-record">record</button>
  <button class="btn-export">export</button>
  <span class="status"></span>
</div>
`.trim()

const CSS = `
:host { all: initial; }
.panel {
  position: fixed;
  right: 12px;
  bottom: 12px;
  width: 320px;
  max-height: 60vh;
  background: #0b1020;
  color: #e8ebf4;
  font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  border: 1px solid #1e2947;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  z-index: 2147483600;
  user-select: none;
  overflow: hidden;
}
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: #141b33;
  cursor: move;
  border-bottom: 1px solid #1e2947;
}
.title { font-weight: 600; letter-spacing: 0.04em; }
.titlebar-actions button {
  background: transparent;
  color: #8a93a8;
  border: none;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 4px;
}
.titlebar-actions button:hover { background: #1e2947; color: #fff; }
.filters { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 10px; border-bottom: 1px solid #1e2947; }
.chip {
  background: #1a2340;
  color: #6f78a2;
  border: 1px solid #253063;
  border-radius: 9999px;
  padding: 2px 8px;
  font: inherit;
  cursor: pointer;
}
.chip-on { background: #26d9a9; color: #06101c; border-color: #26d9a9; }
.scroll { flex: 1; overflow-y: auto; padding: 0 10px; min-height: 60px; }
.empty { color: #6f78a2; padding: 16px 0; text-align: center; font-style: italic; }
table { width: 100%; border-collapse: collapse; font: inherit; }
th { text-align: left; color: #6f78a2; font-weight: 500; padding: 4px 0; position: sticky; top: 0; background: #0b1020; }
td { padding: 3px 0; }
td.name { color: #b9c0d6; }
td.value { text-align: right; color: #26d9a9; font-variant-numeric: tabular-nums; }
.footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-top: 1px solid #1e2947;
}
.footer button {
  background: #1a2340;
  color: #e8ebf4;
  border: 1px solid #253063;
  border-radius: 4px;
  font: inherit;
  padding: 3px 10px;
  cursor: pointer;
}
.footer button:hover { background: #253063; }
.footer .recording { background: #b43a3a; border-color: #b43a3a; }
.footer .status { margin-left: auto; color: #6f78a2; font-size: 11px; }
`
