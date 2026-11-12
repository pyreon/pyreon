/**
 * The devtools panel UI in real Chromium, against a real Pyreon app.
 *
 * The extension itself cannot be loaded into the vitest browser (no
 * `--load-extension`, and Playwright cannot open the DevTools window), so
 * this runs the two halves the extension wires together, in one page:
 *
 *   - a real Pyreon app compiled by the real `@pyreon/vite-plugin` (see
 *     vitest.browser.config.ts) and mounted with `mount()`, which installs
 *     the real `window.__PYREON_DEVTOOLS__`;
 *   - the page half of the bridge (`createHook`, what page-hook.ts runs);
 *   - the panel UI (`createPanelApp`, what panel.ts runs) with the real
 *     panel.css.
 *
 * The transport in between structured-clones every message and delivers it
 * asynchronously, like `postMessage` + `chrome.runtime` do, so the panel
 * only ever sees copies. `scripts/verify-extension.ts` covers the same panel
 * through the real built extension (content script, background relay).
 */
import { For } from '@pyreon/core'
import { computed, effect, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { createHook, type Hook } from '../hook'
import { createPanelApp, type PanelApp, type PanelTheme, type PanelTransport, type TabId } from '../panel-app'
import css from '../panel.css?raw'
import type { HookMessage, PanelMessage, PyreonDevtools } from '../types'

// ── The inspected app ───────────────────────────────────────────────────
function createStore() {
  const draft = signal('')
  const to = signal('team@acme.dev')
  const messages = signal([
    { id: 41, text: 'Standup moved' },
    { id: 42, text: 'Ship it friday?' },
    { id: 43, text: 'Lunch' },
  ])
  // Holds a function once, to make runtime-dom print a real [Pyreon] warning.
  const status = signal<string | (() => string)>('idle')
  const validity = computed(() => (draft().length > 0 && to().includes('@') ? 'ready' : 'empty'))
  const unread = computed(() => messages().length)
  effect(() => {
    document.title = `Inbox (${unread()})`
  })
  return { draft, to, messages, status, validity, unread }
}
let store: ReturnType<typeof createStore>

function Header() {
  return (
    <header class="app-header">
      <h1>Inbox</h1>
      <span class="badge">{store.unread()}</span>
    </header>
  )
}
function MessageRow(props: { text: string }) {
  return <li class="row">{props.text}</li>
}
function MessageList() {
  return (
    <ul class="list">
      <For each={store.messages} by={(m) => m.id}>
        {(m) => <MessageRow text={m.text} />}
      </For>
    </ul>
  )
}
function Composer() {
  return (
    <form class="composer">
      <input class="draft" value={store.draft()} onInput={(e) => store.draft.set((e.currentTarget as HTMLInputElement).value)} />
      <p class="echo">{store.draft()}</p>
      <p class="validity">{store.validity()}</p>
      <p class="status">{store.status()}</p>
    </form>
  )
}
function App() {
  return (
    <main>
      <Header />
      <MessageList />
      <Composer />
    </main>
  )
}

// ── Harness ─────────────────────────────────────────────────────────────
const SHOTS_DIR = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_DEVTOOLS_SHOTS
const tick = () => new Promise((r) => setTimeout(r, 0))
async function waitFor<T>(fn: () => T | null | undefined | false, ms = 4000): Promise<T> {
  const end = performance.now() + ms
  for (;;) {
    const v = fn()
    if (v) return v
    if (performance.now() > end) throw new Error(`waitFor timed out: ${fn.toString().slice(0, 140)}`)
    await new Promise((r) => setTimeout(r, 20))
  }
}

let hook: Hook
let panel: PanelApp
let panelHost: HTMLElement
let appHost: HTMLElement
let disposeApp: () => void
const toPanel: ((m: HookMessage) => void)[] = []
// Measured cost per graph poll, for the 10,000-signal case. Extension
// messaging (`chrome.runtime.sendMessage` / ports) JSON-serialises, so the
// transport does the same: the page pays for the graph walk plus
// `JSON.stringify`, the panel for `JSON.parse` plus rendering.
const timing = { pageMs: 0, panelMs: 0, bytes: 0 }

function transport(): PanelTransport {
  return {
    send(msg: PanelMessage) {
      const copy = JSON.parse(JSON.stringify(msg)) as PanelMessage
      setTimeout(() => {
        const t0 = performance.now()
        hook.handle(copy)
        if (copy.type === 'reactive-poll' && copy.graph !== false) timing.pageMs = performance.now() - t0
      }, 0)
    },
    onMessage(cb) {
      toPanel.push(cb)
    },
    onDisconnect() {},
  }
}

function emit(msg: HookMessage): void {
  const json = JSON.stringify(msg)
  const full = msg.type === 'reactive-snapshot' && msg.graph !== null
  if (full) timing.bytes = json.length
  setTimeout(() => {
    const t0 = performance.now()
    const copy = JSON.parse(json) as HookMessage
    for (const cb of toPanel) cb(copy)
    if (full) timing.panelMs = performance.now() - t0
  }, 0)
}

const $ = <T extends Element = HTMLElement>(sel: string) => panelHost.querySelector<T>(sel)
const $$ = (sel: string) => Array.from(panelHost.querySelectorAll<HTMLElement>(sel))
const view = (tab: TabId) => $(`#pd-view-${tab}`) as HTMLElement

function setTheme(theme: PanelTheme): void {
  panel.setTheme(theme)
}

beforeAll(async () => {
  await page.viewport(1100, 760)
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  document.body.style.margin = '0'
  appHost = document.createElement('div')
  appHost.id = 'app-host'
  document.body.append(appHost)
  panelHost = document.createElement('div')
  panelHost.id = 'panel-host'
  panelHost.style.cssText = 'width:1100px;height:640px;position:relative'
  document.body.append(panelHost)

  store = createStore()
  disposeApp = mount(<App />, appHost)
  const dt = window.__PYREON_DEVTOOLS__ as PyreonDevtools
  hook = createHook(dt, { emit, host: 'localhost:5173', console, errorTarget: window })
  panel = createPanelApp(panelHost, transport(), { theme: 'dark', pollMs: 150, recordPollMs: 60 })
  await waitFor(() => $$('.trow').length > 0)
})

afterAll(() => {
  panel.dispose()
  hook.dispose()
  disposeApp()
})

// ── Contrast + overflow audit ───────────────────────────────────────────
type RGBA = [number, number, number, number]
function parse(c: string): RGBA {
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (!m) throw new Error(`unparsed colour ${c}`)
  const p = (m[1] as string).split(/[ ,/]+/).filter(Boolean).map(Number)
  return [p[0] as number, p[1] as number, p[2] as number, p.length > 3 ? (p[3] as number) : 1]
}
function over(top: RGBA, under: RGBA): RGBA {
  const a = top[3]
  return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]
}
function lum([r, g, b]: RGBA): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function ratio(a: RGBA, b: RGBA): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}
function background(el: Element | null): RGBA {
  const layers: RGBA[] = []
  for (let e = el; e; e = e.parentElement) {
    const bg = parse(getComputedStyle(e).backgroundColor)
    if (bg[3] > 0) layers.push(bg)
    if (bg[3] >= 1) break
  }
  let out: RGBA = [255, 255, 255, 1]
  for (let i = layers.length - 1; i >= 0; i--) out = over(layers[i] as RGBA, out)
  return out
}
function contrastFailures(): string[] {
  const out: string[] = []
  const walker = document.createTreeWalker(panelHost, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent?.trim()) continue
    const el = n.parentElement as HTMLElement
    if (el.closest('svg')) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0 || el.closest('[hidden]')) continue
    const bg = background(el)
    const fg = over(parse(getComputedStyle(el).color), bg)
    const c = ratio(fg, bg)
    if (c < 4.5) out.push(`${c.toFixed(2)} "${n.textContent.trim().slice(0, 30)}" <${el.tagName.toLowerCase()} class="${el.className}">`)
  }
  return out
}
function overflowing(): string[] {
  const out: string[] = []
  const host = panelHost.getBoundingClientRect()
  for (const el of $$('*')) {
    if (el.closest('.v-scroll, .app-tabs, .pane, .con-scroll')) {
      // inside a scroll container: only the container itself must fit
      if (!el.matches('.v-scroll, .app-tabs, .pane, .con-scroll')) continue
    }
    const r = el.getBoundingClientRect()
    if (r.width === 0) continue
    if (r.right > host.right + 0.5) out.push(`${el.tagName.toLowerCase()}.${el.className} right=${r.right.toFixed(0)}`)
  }
  return out
}

async function show(tab: TabId): Promise<void> {
  panel.selectTab(tab)
  await tick()
  await new Promise((r) => requestAnimationFrame(() => r(null)))
}

// ── Tests ───────────────────────────────────────────────────────────────
describe('panel against a real Pyreon app', () => {
  it('rebuilds the component tree from parentId (post-order registration)', async () => {
    // Small tree: opened in full on first load. The rows sit under the
    // <For> that owns them, inside MessageList.
    const names = $$('.trow .tg').map((e) => e.textContent)
    expect(names).toEqual(['App', 'Header', 'MessageList', 'For', 'MessageRow', 'MessageRow', 'MessageRow', 'Composer'])
    const levels = $$('.trow').map((r) => Number(r.getAttribute('aria-level')))
    expect(levels).toEqual([1, 2, 2, 3, 4, 4, 4, 2])
    expect($('.app-status')?.textContent).toContain('connected · localhost:5173')
  })

  it('the tree is keyboard operable and the inspector explains the latest update', async () => {
    const tree = $('[role="tree"]') as HTMLElement
    tree.focus()
    const key = (k: string) => tree.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
    key('Home')
    key('ArrowDown') // Header
    key('ArrowDown') // MessageList
    key('ArrowLeft') // collapse
    await tick()
    const list = $$('.trow').find((r) => r.textContent?.includes('MessageList')) as HTMLElement
    expect(list.getAttribute('aria-expanded')).toBe('false')
    expect(list.textContent).toContain('1 child')
    expect($$('.trow .tg').filter((e) => e.textContent === 'MessageRow')).toHaveLength(0)
    key('ArrowRight') // expand again
    await tick()
    expect($$('.trow .tg').filter((e) => e.textContent === 'MessageRow')).toHaveLength(3)
    key('End') // Composer (last row)
    await tick()
    const selected = $('.trow[aria-selected="true"]') as HTMLElement
    expect(selected.textContent).toContain('Composer')
    expect(tree.getAttribute('aria-activedescendant')).toBe(selected.id)

    // Type into the real app; the inspector names the write behind it.
    const input = appHost.querySelector('input.draft') as HTMLInputElement
    input.value = 'Ship it'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const why = await waitFor(() => {
      const w = $('.why')
      return w?.textContent?.includes('draft') && w.textContent.includes('→') ? w : null
    })
    expect($('#pd-view-components .pane-h .ins-name')?.textContent).toBe('Composer')
    const reads = $$('#pd-view-components .kv dt').map((d) => d.textContent)
    // `validity` is a computed: it has no runtime name, so the panel names
    // it by where it was created.
    expect(reads).toEqual(expect.arrayContaining(['owner', 'draft', expect.stringMatching(/^panel\.browser\.test\.tsx:\d+$/)]))
    expect($$('#pd-view-components .kv dd').map((d) => d.textContent)).toContain('App › Composer')
    expect(why.textContent).toMatch(
      /draft signal changed \(panel\.browser\.test\.tsx:\d+\) → panel\.browser\.test\.tsx:\d+ computed recomputed/,
    )
  })

  it('tabs are a keyboard tablist', async () => {
    const tab = $('#pd-tab-components') as HTMLButtonElement
    tab.focus()
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await tick()
    expect($('#pd-tab-graph')?.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement?.id).toBe('pd-tab-graph')
    expect(view('graph').hidden).toBe(false)
    expect(view('components').hidden).toBe(true)
    expect($$('[role="tab"][tabindex="0"]')).toHaveLength(1)
    await show('components')
  })

  it('signals: real values, filter, and selecting one scopes the graph to it', async () => {
    await show('signals')
    await waitFor(() => $$('.sig-row:not(.head)').some((r) => r.textContent?.includes('"Ship it"')))
    const draftRow = $$('.sig-row:not(.head)').find((r) => r.querySelector('.t')?.textContent === 'draft') as HTMLElement
    expect(draftRow.textContent).toContain('"Ship it"')
    expect(Number(draftRow.children[3]?.textContent)).toBeGreaterThanOrEqual(1)
    expect($('#pd-tab-signals .ct')?.textContent).toMatch(/^\d+$/)

    const filter = $('input[aria-label="Filter signals"]') as HTMLInputElement
    filter.value = 'DRA'
    filter.dispatchEvent(new Event('input'))
    await tick()
    expect($$('.sig-row:not(.head) .t').map((t) => t.textContent)).toEqual(['draft'])
    expect($('#pd-view-signals .cap')?.textContent).toMatch(/^1 of \d+$/)
    filter.value = ''
    filter.dispatchEvent(new Event('input'))
    await tick()

    ;($$('.sig-row:not(.head)').find((r) => r.querySelector('.t')?.textContent === 'draft') as HTMLElement).click()
    await show('graph')
    await waitFor(() => $$('.gn').length > 0)
    const labels = $$('.gn text').map((t) => t.textContent)
    // draft and what it feeds (the `validity` computed, label truncated);
    // not `to`, which only shares a subscriber with draft.
    expect(labels).toEqual(expect.arrayContaining(['draft', expect.stringMatching(/^panel\.browser\.te/)]))
    expect(labels).not.toContain('to')
    expect($('#pd-view-graph .cap')?.textContent).toContain('around draft')
    ;($$('.seg2 button')[1] as HTMLButtonElement).click()
    await tick()
    expect($$('.gn').length).toBeGreaterThanOrEqual(labels.length)
  })

  it('effects: one lane per effect that ran, with what it reads', async () => {
    store.messages.set([...store.messages(), { id: 44, text: 'New' }])
    await show('effects')
    const lane = await waitFor(() => $$('.lane').find((l) => l.textContent?.includes('reads')))
    // `unread` is a computed, named by where it was created.
    expect(lane.textContent).toMatch(/reads panel\.browser\.test\.tsx:\d+/)
    expect(lane.querySelectorAll('.lt i').length).toBeGreaterThanOrEqual(1)
  })

  it('profiler: records batches rooted at the write that started them', async () => {
    await show('profiler')
    ;($('#pd-view-profiler .pane-h .ib[aria-label="Record"]') as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 200))
    store.to.set('ops@acme.dev')
    store.draft.set('Ship it now')
    const rows = await waitFor(() => ($$('.pb').length >= 2 ? $$('.pb') : null))
    const labels = rows.map((r) => r.firstElementChild?.textContent)
    expect(labels).toEqual(expect.arrayContaining([expect.stringMatching(/^draft changed · \d+ fires?$/), expect.stringMatching(/^to changed/)]))
    expect(Number($$('.prof-sum b')[0]?.textContent)).toBeGreaterThanOrEqual(2)
    ;($('#pd-view-profiler .pane-h .ib[aria-pressed="true"]') as HTMLButtonElement).click()
  })

  it('console: captures a real [Pyreon] warning from the framework, and evaluates', async () => {
    await show('console')
    // A function in a text binding: runtime-dom warns that it was coerced.
    store.status.set(() => 'sending')
    const line = await waitFor(() => $$('.ll.warn').find((l) => l.textContent?.includes('[Pyreon]')))
    expect(line.querySelector('.msg b')?.textContent).toBe('[Pyreon]')
    expect($('#pd-tab-console .ct')?.textContent).toMatch(/^[1-9]/)
    const input = $('input.eval') as HTMLInputElement
    input.value = '6 * 7'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await waitFor(() => $$('.ll.out').some((l) => l.textContent?.includes('42')))
  })

  for (const theme of ['dark', 'light'] as const) {
    for (const width of [1100, 700]) {
      it(`${theme} at ${width}px: every tab passes 4.5:1 text contrast and nothing overflows`, async () => {
        setTheme(theme)
        // Resize the viewport too: the 760 px breakpoint is a media query.
        await page.viewport(width, 760)
        panelHost.style.width = `${width}px`
        const failures: string[] = []
        const over: string[] = []
        for (const tab of ['components', 'graph', 'signals', 'effects', 'profiler', 'console'] as TabId[]) {
          await show(tab)
          failures.push(...contrastFailures().map((f) => `${tab}: ${f}`))
          over.push(...overflowing().map((f) => `${tab}: ${f}`))
          // Opt-in visual record (VITE_DEVTOOLS_SHOTS=1), into the gitignored verification-screenshots/.
          if (SHOTS_DIR) {
            await page.screenshot({ path: `../../verification-screenshots/harness-${tab}-${theme}-${width}.png`, element: panelHost })
          }
        }
        expect(failures).toEqual([])
        expect(over).toEqual([])
        // Wide: tree beside the inspector. Below 760 px: tree above it.
        await show('components')
        const cols = getComputedStyle($('.dt-split') as HTMLElement).gridTemplateColumns.split(' ')
        expect(cols).toHaveLength(width === 700 ? 1 : 2)
        panelHost.style.width = '1100px'
        await page.viewport(1100, 760)
        setTheme('dark')
      })
    }
  }
})

describe('panel performance with 10,000 signals', () => {
  it('keeps the DOM bounded and stays responsive', async () => {
    const many = Array.from({ length: 10_000 }, (_, i) => signal(i, { name: `bulk${i}` }))
    const derived = many.slice(0, 200).map((s) => computed(() => s() * 2))
    const effects = derived.map((d) => effect(() => void d()))
    try {
      await show('signals')
      // The first poll also resolves every new node's source location
      // (a one-time stack parse per node).
      await waitFor(() => $('#pd-tab-signals .ct')?.textContent?.replace(/,/g, '').match(/^1\d{4}$/), 10_000)
      const firstPageMs = timing.pageMs
      const samples: { page: number; panel: number }[] = []
      for (let i = 0; i < 7; i++) {
        await new Promise((r) => setTimeout(r, 160))
        samples.push({ page: timing.pageMs, panel: timing.panelMs })
      }
      const rows = $$('.sig-row:not(.head)').length
      expect(rows).toBeLessThanOrEqual(60)
      // Scroll to the end: still bounded, last rows render.
      const scroller = $('#pd-view-signals .v-scroll') as HTMLElement
      scroller.scrollTop = scroller.scrollHeight
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      expect($$('.sig-row:not(.head)').length).toBeLessThanOrEqual(60)

      await show('graph')
      const g0 = performance.now()
      ;($$('.seg2 button')[1] as HTMLButtonElement).click()
      const graphMs = performance.now() - g0
      expect($$('.gn').length).toBeLessThanOrEqual(120)
      expect($('#pd-view-graph .cap')?.textContent).toMatch(/showing 120 of 10,\d{3} nodes/)

      await show('effects')
      expect($$('.lane').length).toBeLessThanOrEqual(150)

      const med = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number
      const report = {
        firstPollPageMs: +firstPageMs.toFixed(1),
        pagePerPollMs: +med(samples.map((s) => s.page)).toFixed(1),
        panelPerPollMs: +med(samples.map((s) => s.panel)).toFixed(1),
        snapshotKB: Math.round(timing.bytes / 1024),
        graphEverythingRenderMs: +graphMs.toFixed(1),
        signalRowsInDom: rows,
      }
      // Recorded in the PR description; not asserted (machine-dependent).
      console.log(`[devtools perf] ${JSON.stringify(report)}`)
    } finally {
      for (const e of effects) e.dispose()
      many.length = 0
    }
  }, 30_000)
})
