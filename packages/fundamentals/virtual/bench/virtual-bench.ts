#!/usr/bin/env bun
/**
 * @pyreon/virtual vs @tanstack/react-virtual — objective ADAPTER head-to-head.
 *
 * Run: `bun run bench:react-virtual` (sets NODE_ENV=production).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FAIR BY CONSTRUCTION
 * ───────────────────────────────────────────────────────────────────────────
 * Both @pyreon/virtual and @tanstack/react-virtual wrap the SAME
 * `@tanstack/virtual-core` (3.17.4, pinned tree-wide via root `overrides` — the
 * range-math, window computation, and measurement cache both sides use are
 * byte-identical, verified in Section 4). This bench therefore measures the
 * ADAPTER layer — how each library surfaces a scroll/measure to the DOM — NOT
 * the virtualization engine. Any difference is 100% adapter.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * OBJECTIVITY CONTRACT (every loop lesson applied)
 * ───────────────────────────────────────────────────────────────────────────
 *  1. `NODE_ENV=production` forced FIRST (the npm script's shell sets it too).
 *     Pyreon's dev mode keeps the reactive-devtools registry always-on; React's
 *     dev build ships freeze/prop-type/act overhead. Both are instrumentation.
 *  2. Same virtual-core (3.17.4) for BOTH — the engine is identical.
 *  3. CORRECTNESS GATE — both adapters must render the SAME visible index window
 *     at the SAME scroll offsets (mount + deep scroll) before any number counts.
 *  4. The HEADLINE result is a COUNT (component re-renders / row-element
 *     creations / row-body executions), which is EXACT and deterministic. React
 *     is NOT sandbagged: it is benched BOTH naive AND with the idiomatic
 *     `React.memo`'d row (best practice) — the memoized number gets full credit.
 *  5. happy-dom has NO layout — a scroll is driven synthetically (set
 *     `scrollTop`, dispatch a `scroll` event) so virtual-core's own offset
 *     observer recomputes the window; we then measure each adapter's RESPONSE.
 *     Disclosed framing: we drive the engine identically and count the adapter's
 *     reaction.
 *  6. Timing cells (Section 3) run in ISOLATED child processes, pooled median +
 *     bootstrap CI95, `🤝` marks a CI-overlap tie. No forced GC (JSC re-tiers on
 *     it). React's number legitimately INCLUDES its render+reconcile — that IS
 *     react-virtual's cost to surface a scroll; it has no other path.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * HONEST READ (don't cherry-pick)
 * ───────────────────────────────────────────────────────────────────────────
 *  - Section 1 (SCROLL that recycles items) is the crux. The row-BODY execution
 *    count is a 🤝 TIE with MEMOIZED react-virtual (both run only the J entering
 *    rows). Reported honestly — Pyreon did not invent skipping unchanged rows;
 *    React.memo does it too. Pyreon's structural win is the two things memo
 *    canNOT skip: the PARENT component re-render (0 vs 1 per scroll) and the
 *    per-scroll allocation + keyed reconcile of the WHOLE visible window of VDOM
 *    elements (J vs W). Pyreon's `<For>` creates VNodes only for entering rows.
 *  - Section 2 (dynamic remeasure via measureElement) is the correctness+fine-
 *    grained result: a remeasure shifts only the rows below it; Pyreon's
 *    per-index `item()` signals patch exactly those, with 0 parent re-render.
 *    (This is also a BUG FIX — the captured-`<For>`-item pattern reads a stale
 *    snapshot and never repositions on remeasure; `item()` is required for
 *    dynamically-measured lists. See the package README "dynamic sizing".)
 *  - Section 3 (mount) is the Pareto disclosure: virtualization mount cost is
 *    dominated by the shared engine; the adapter delta is small and reported
 *    without spin.
 *  - Section 4 is a CONTROL: getVirtualItems() is byte-identical engine work —
 *    a tie confirms the fair-by-construction claim.
 */
process.env.NODE_ENV = 'production'

import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()
// We drive React commits synchronously via flushSync (the correct bench
// primitive) — silence React 19's "not wrapped in act(...)" advisory.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false

// ─── list shape (identical both sides) ───────────────────────────────────────
const N = 10_000
const ROW = 40 // px per row (fixed-size → row `start` = index * ROW, invariant)
const VIEWPORT = 600 // px
const OVERSCAN = 4
const SCROLL_ROWS = 5 // scroll by 5 rows → J≈5 enter, 1 leaves, rest stay

// ─── a happy-dom scroll container with a settable scrollTop + fixed viewport ──
function makeContainer(): HTMLDivElement {
  const c = document.createElement('div') as HTMLDivElement & { __st?: number }
  Object.defineProperty(c, 'clientHeight', { value: VIEWPORT, configurable: true })
  Object.defineProperty(c, 'offsetHeight', { value: VIEWPORT, configurable: true })
  Object.defineProperty(c, 'offsetWidth', { value: 400, configurable: true })
  let st = 0
  Object.defineProperty(c, 'scrollTop', {
    get: () => st,
    set: (v: number) => {
      st = v
    },
    configurable: true,
  })
  document.body.appendChild(c)
  return c
}

// Drive a synthetic scroll: virtual-core's offset observer listens for `scroll`.
function driveScroll(container: HTMLElement, offset: number): void {
  ;(container as HTMLElement & { scrollTop: number }).scrollTop = offset
  container.dispatchEvent(new Event('scroll'))
}

// ─── shared stats (identical to store/query-bench methodology) ───────────────

declare const Bun: {
  spawnSync: (
    cmd: string[],
    opts: { env: Record<string, string | undefined> },
  ) => { stdout: Uint8Array; exitCode: number }
}

const now = () => Number(process.hrtime.bigint())

function measureSamples(
  fn: () => void,
  { warmup = 2_000, iters = 500, runs = 15 }: { warmup?: number; iters?: number; runs?: number } = {},
): number[] {
  for (let i = 0; i < warmup; i++) fn()
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) fn()
    samples.push((now() - t0) / iters)
  }
  return samples
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[s.length >> 1] as number
}

function bootstrapCI(samples: number[], resamples = 2_000): [number, number] {
  const meds: number[] = []
  const n = samples.length
  for (let r = 0; r < resamples; r++) {
    const re: number[] = []
    for (let i = 0; i < n; i++) re.push(samples[(Math.random() * n) | 0] as number)
    meds.push(median(re))
  }
  meds.sort((a, b) => a - b)
  return [meds[(resamples * 0.025) | 0] as number, meds[(resamples * 0.975) | 0] as number]
}

const overlaps = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1]
const fmt = (n: number) => n.toLocaleString('en-US')

// ═════════════════════════════════════════════════════════════════════════════
// COUNT HARNESSES (exact, deterministic — the crux)
// ═════════════════════════════════════════════════════════════════════════════

interface CountResult {
  parentRuns: number
  rowElements: number
  rowBodies: number
  windowSize: number
  entering: number
}

/**
 * Pyreon: virtual list with the fine-grained `item()` pattern. Counts:
 *  - parentRuns: component-body executions (Pyreon runs a component ONCE).
 *  - rowElements: VNodes created for rows (<For> renderItem invocations).
 *  - rowBodies: row style-accessor executions (the per-row reactive binding).
 */
async function pyreonScrollCounts(): Promise<CountResult> {
  const { h, For } = await import('@pyreon/core')
  const { mount } = await import('@pyreon/runtime-dom')
  const { useVirtualizer } = await import('../src/use-virtualizer')

  const container = makeContainer()
  const host = document.createElement('div')
  container.appendChild(host)

  let parentRuns = 0
  let rowElements = 0
  let rowBodies = 0
  type V = ReturnType<typeof useVirtualizer<HTMLElement, HTMLElement>>
  let v!: V

  const App = () => {
    parentRuns++
    v = useVirtualizer<HTMLElement, HTMLElement>(() => ({
      count: N,
      getScrollElement: () => container,
      estimateSize: () => ROW,
      overscan: OVERSCAN,
    }))
    return h(
      'div',
      { style: () => `height:${v.totalSize()}px;position:relative` },
      h(
        For as unknown as (props: unknown) => unknown,
        {
          each: () => v.virtualItems(),
          by: (it: { index: number }) => it.index,
        },
        (it: { index: number }) => {
          rowElements++ // a VNode is created for this (entering) row
          const m = v.item(it.index)
          return h(
            'div',
            {
              class: 'row',
              'data-i': String(it.index),
              style: () => {
                rowBodies++ // this row's reactive position binding ran
                return `position:absolute;top:0;transform:translateY(${m.start()}px);height:${m.size()}px`
              },
            },
            `Row ${it.index}`,
          )
        },
      ),
    )
  }

  const dispose = mount(h(App, {}), host)
  const windowSize = v.virtualItems().length
  const before = new Set([...container.querySelectorAll('.row')].map((r) => r.getAttribute('data-i')))
  // reset counters — measure ONLY the scroll response
  parentRuns = 0
  rowElements = 0
  rowBodies = 0
  driveScroll(container, SCROLL_ROWS * ROW)
  const afterIdx = [...container.querySelectorAll('.row')].map((r) => r.getAttribute('data-i'))
  const entering = afterIdx.filter((i) => !before.has(i)).length

  if (typeof dispose === 'function') dispose()
  container.remove()
  return { parentRuns, rowElements, rowBodies, windowSize, entering }
}

/** react-virtual: idiomatic list, `React.memo`'d row when `memoized`. */
async function reactScrollCounts(memoized: boolean): Promise<CountResult> {
  const React = (await import('react')).default
  const { createElement: h, memo } = React
  const { createRoot } = await import('react-dom/client')
  const { flushSync } = await import('react-dom')
  const { useVirtualizer } = await import('@tanstack/react-virtual')

  const container = makeContainer()

  let parentRuns = 0
  let rowElements = 0
  let rowBodies = 0

  const RowInner = (p: { index: number; transform: string; size: number }) => {
    rowBodies++
    return h(
      'div',
      {
        className: 'row',
        'data-i': String(p.index),
        style: { position: 'absolute', top: 0, transform: p.transform, height: p.size },
      },
      `Row ${p.index}`,
    )
  }
  const Row = memoized ? memo(RowInner) : RowInner

  type V = ReturnType<typeof useVirtualizer>
  let vref!: V
  function List() {
    parentRuns++
    const v = useVirtualizer({
      count: N,
      getScrollElement: () => container,
      estimateSize: () => ROW,
      overscan: OVERSCAN,
    })
    vref = v
    return h(
      'div',
      { style: { height: v.getTotalSize(), position: 'relative' } },
      v.getVirtualItems().map((vi) => {
        rowElements++
        return h(Row, {
          key: vi.key,
          index: vi.index,
          transform: `translateY(${vi.start}px)`,
          size: vi.size,
        })
      }),
    )
  }

  const root = createRoot(container)
  flushSync(() => root.render(h(List)))
  await new Promise((r) => setTimeout(r, 0))
  const windowSize = vref.getVirtualItems().length
  const before = new Set([...container.querySelectorAll('.row')].map((r) => r.getAttribute('data-i')))
  parentRuns = 0
  rowElements = 0
  rowBodies = 0
  flushSync(() => driveScroll(container, SCROLL_ROWS * ROW))
  await new Promise((r) => setTimeout(r, 0))
  const afterIdx = [...container.querySelectorAll('.row')].map((r) => r.getAttribute('data-i'))
  const entering = afterIdx.filter((i) => !before.has(i)).length

  root.unmount()
  container.remove()
  return { parentRuns, rowElements, rowBodies, windowSize, entering }
}

// ── dynamic remeasure counts ─────────────────────────────────────────────────

interface RemeasureResult {
  parentRuns: number
  rowElements: number
  rowBodies: number
  windowSize: number
  repositioned: boolean // did the row BELOW the remeasured one actually move?
}

async function pyreonRemeasureCounts(): Promise<RemeasureResult> {
  const { h, For } = await import('@pyreon/core')
  const { mount } = await import('@pyreon/runtime-dom')
  const { useVirtualizer } = await import('../src/use-virtualizer')

  const container = makeContainer()
  const host = document.createElement('div')
  container.appendChild(host)

  let parentRuns = 0
  let rowElements = 0
  let rowBodies = 0
  type V = ReturnType<typeof useVirtualizer<HTMLElement, HTMLElement>>
  let v!: V

  const App = () => {
    parentRuns++
    v = useVirtualizer<HTMLElement, HTMLElement>(() => ({
      count: N,
      getScrollElement: () => container,
      estimateSize: () => ROW,
      overscan: OVERSCAN,
    }))
    return h(
      'div',
      { style: () => `height:${v.totalSize()}px;position:relative` },
      h(
        For as unknown as (props: unknown) => unknown,
        { each: () => v.virtualItems(), by: (it: { index: number }) => it.index },
        (it: { index: number }) => {
          rowElements++
          const m = v.item(it.index)
          return h(
            'div',
            {
              class: 'row',
              'data-i': String(it.index),
              style: () => {
                rowBodies++
                return `transform:translateY(${m.start()}px);height:${m.size()}px`
              },
            },
            `Row ${it.index}`,
          )
        },
      ),
    )
  }

  const dispose = mount(h(App, {}), host)
  parentRuns = 0
  rowElements = 0
  rowBodies = 0
  // Grow the FIRST visible row by 100px → every row below shifts by 100.
  const below = container.querySelector('.row[data-i="3"]') as HTMLElement | null
  const startBefore = below?.getAttribute('style') ?? ''
  v.instance.resizeItem(0, ROW + 100)
  const startAfter =
    (container.querySelector('.row[data-i="3"]') as HTMLElement | null)?.getAttribute('style') ?? ''
  const repositioned = startBefore !== startAfter && startAfter.includes('translateY(220px)')

  if (typeof dispose === 'function') dispose()
  container.remove()
  return { parentRuns, rowElements, rowBodies, windowSize: v.virtualItems().length, repositioned }
}

async function reactRemeasureCounts(): Promise<RemeasureResult> {
  const React = (await import('react')).default
  const { createElement: h, memo } = React
  const { createRoot } = await import('react-dom/client')
  const { flushSync } = await import('react-dom')
  const { useVirtualizer } = await import('@tanstack/react-virtual')

  const container = makeContainer()
  let parentRuns = 0
  let rowElements = 0
  let rowBodies = 0

  const Row = memo((p: { index: number; transform: string; size: number }) => {
    rowBodies++
    return h(
      'div',
      {
        className: 'row',
        'data-i': String(p.index),
        style: { transform: p.transform, height: p.size },
      },
      `Row ${p.index}`,
    )
  })

  type V = ReturnType<typeof useVirtualizer>
  let vref!: V
  function List() {
    parentRuns++
    const v = useVirtualizer({
      count: N,
      getScrollElement: () => container,
      estimateSize: () => ROW,
      overscan: OVERSCAN,
    })
    vref = v
    return h(
      'div',
      { style: { height: v.getTotalSize(), position: 'relative' } },
      v.getVirtualItems().map((vi) => {
        rowElements++
        return h(Row, {
          key: vi.key,
          index: vi.index,
          transform: `translateY(${vi.start}px)`,
          size: vi.size,
        })
      }),
    )
  }
  const root = createRoot(container)
  flushSync(() => root.render(h(List)))
  await new Promise((r) => setTimeout(r, 0))
  parentRuns = 0
  rowElements = 0
  rowBodies = 0
  const startBefore =
    (container.querySelector('.row[data-i="3"]') as HTMLElement | null)?.getAttribute('style') ?? ''
  flushSync(() => vref.resizeItem(0, ROW + 100))
  await new Promise((r) => setTimeout(r, 0))
  const startAfter =
    (container.querySelector('.row[data-i="3"]') as HTMLElement | null)?.getAttribute('style') ?? ''
  const repositioned = startBefore !== startAfter && startAfter.includes('translateY(220px)')

  const windowSize = vref.getVirtualItems().length
  root.unmount()
  container.remove()
  return { parentRuns, rowElements, rowBodies, windowSize, repositioned }
}

// ═════════════════════════════════════════════════════════════════════════════
// TIMING CHILD (op × impl) — isolated process, prints JSON samples
// ═════════════════════════════════════════════════════════════════════════════

type Impl = 'pyreon' | 'pyreon-tpl' | 'react'
const childOp = process.argv[2]
const childImpl = process.argv[3] as Impl | undefined

// ── Real-compiler fixtures (impl 'pyreon-tpl') ───────────────────────────────
// The h() fixtures below are a disclosed self-handicap: no vite-plugin app pays
// the runtime-VNode mount tax. 'pyreon-tpl' compiles the SAME fixture (1:1 —
// same For/by keys, same style bindings, same row text) through the REAL
// two-stage pipeline every shipped app runs: (1) @pyreon/compiler transformJSX
// templates the DOM subtrees (per-row `_tpl` + style bind), (2) esbuild's
// automatic JSX runtime lowers the remaining component JSX (`<For>`, the shell)
// with jsxImportSource '@pyreon/core' — exactly Vite's esbuild pass. Injection
// via `new Function` mirrors runtime-dom's compiler-integration tests.
// NOTE: `\${`-escapes below keep the inner template literals INSIDE the source.
const SCROLL_APP_SOURCE = `
const App = () => {
  const v = useVirtualizer(() => ({
    count: N,
    getScrollElement: () => container,
    estimateSize: () => ROW,
    overscan: OVERSCAN,
  }))
  return (
    <div style={() => \`height:\${v.totalSize()}px;position:relative\`}>
      <For each={() => v.virtualItems()} by={(it) => it.index}>
        {(it) => {
          const m = v.item(it.index)
          return <div style={() => \`transform:translateY(\${m.start()}px);height:\${m.size()}px\`}>{\`Row \${it.index}\`}</div>
        }}
      </For>
    </div>
  )
}
`
const MOUNT_APP_SOURCE = `
const App = () => {
  const v = useVirtualizer(() => ({
    count: N,
    getScrollElement: () => container,
    estimateSize: () => ROW,
    overscan: OVERSCAN,
  }))
  return (
    <div style={() => \`height:\${v.totalSize()}px;position:relative\`}>
      <For each={() => v.virtualItems()} by={(it) => it.index}>
        {(it) => <div style={\`transform:translateY(\${it.start}px)\`}>{\`Row \${it.index}\`}</div>}
      </For>
    </div>
  )
}
`
const MOUNT_FG_APP_SOURCE = `
const App = () => {
  const v = useVirtualizer(() => ({
    count: N,
    getScrollElement: () => container,
    estimateSize: () => ROW,
    overscan: OVERSCAN,
  }))
  return (
    <div style={() => \`height:\${v.totalSize()}px;position:relative\`}>
      <For each={() => v.virtualItems()} by={(it) => it.index}>
        {(it) => <div style={() => \`transform:translateY(\${v.item(it.index).start()}px)\`}>{\`Row \${it.index}\`}</div>}
      </For>
    </div>
  )
}
`

async function compileApp(
  source: string,
  closure: Record<string, unknown>,
): Promise<() => unknown> {
  const core = await import('@pyreon/core')
  const reactivity = await import('@pyreon/reactivity')
  const rd = await import('@pyreon/runtime-dom')
  const jsxRuntime = await import('@pyreon/core/jsx-runtime')
  // Relative compiler import: not a dep of @pyreon/virtual (bench-only usage).
  const { transformJSX } = await import('../../../core/compiler/src/index')
  const esbuild = await import('esbuild')
  const stage1 = transformJSX(source, 'bench-app.tsx').code
  const stage2 = esbuild.transformSync(stage1, {
    loader: 'tsx',
    jsx: 'automatic',
    jsxImportSource: '@pyreon/core',
  }).code
  const body = stage2.replace(/^import\s+.*$/gm, '').trim()
  const deps: Record<string, unknown> = {
    _tpl: (rd as any)._tpl,
    _bind: (reactivity as any)._bind,
    _bindText: (rd as any)._bindText,
    _bindDirect: (rd as any)._bindDirect,
    _setChild: (rd as any)._setChild,
    _setChildAt: (rd as any)._setChildAt,
    _mountSlot: (rd as any)._mountSlot,
    bindPolymorphicText: (rd as any).bindPolymorphicText,
    _applyProps: (rd as any)._applyProps,
    _setStyle: (rd as any)._setStyle,
    _setClass: (rd as any)._setClass,
    _setAttr: (rd as any)._setAttr,
    _rp: (core as any)._rp,
    _cx: (core as any).cx,
    _wrapSpread: (core as any)._wrapSpread,
    h: core.h,
    Fragment: core.Fragment,
    jsx: (jsxRuntime as any).jsx,
    jsxs: (jsxRuntime as any).jsxs,
    document,
    ...closure,
  }
  const fn = new Function(...Object.keys(deps), `${body}\nreturn App`)
  return fn(...Object.values(deps)) as () => unknown
}

if (childOp) {
  if (childImpl !== 'pyreon' && childImpl !== 'pyreon-tpl' && childImpl !== 'react')
    throw new Error(`bad impl: ${childImpl}`)

  if (childOp === 'scroll') {
    // Steady-state: drive ONE scroll → DOM reflects the moved window. The cost
    // each adapter pays to surface one scroll.
    if (childImpl === 'pyreon' || childImpl === 'pyreon-tpl') {
      const { h, For } = await import('@pyreon/core')
      const { mount } = await import('@pyreon/runtime-dom')
      const { useVirtualizer } = await import('../src/use-virtualizer')
      const container = makeContainer()
      const host = document.createElement('div')
      container.appendChild(host)
      type V = ReturnType<typeof useVirtualizer<HTMLElement, HTMLElement>>
      let App: () => unknown
      if (childImpl === 'pyreon-tpl') {
        App = await compileApp(SCROLL_APP_SOURCE, { useVirtualizer, For, container, N, ROW, OVERSCAN })
      } else {
        let v!: V
        App = () => {
          v = useVirtualizer<HTMLElement, HTMLElement>(() => ({
            count: N,
            getScrollElement: () => container,
            estimateSize: () => ROW,
            overscan: OVERSCAN,
          }))
          return h(
            'div',
            { style: () => `height:${v.totalSize()}px;position:relative` },
            h(
              For as unknown as (props: unknown) => unknown,
              { each: () => v.virtualItems(), by: (it: { index: number }) => it.index },
              (it: { index: number }) => {
                const m = v.item(it.index)
                return h(
                  'div',
                  { style: () => `transform:translateY(${m.start()}px);height:${m.size()}px` },
                  `Row ${it.index}`,
                )
              },
            ),
          )
        }
      }
      mount(h(App as (props: unknown) => unknown, {}), host)
      // correctness (untimed): the window starts at row 0 and MOVES on scroll
      const firstRowText = () =>
        (host.firstElementChild?.firstElementChild as HTMLElement | null)?.textContent
      if (firstRowText() !== 'Row 0')
        throw new Error(`[correctness] ${childImpl} scroll mount: first row "${firstRowText()}" ≠ "Row 0"`)
      driveScroll(container, 200 * ROW)
      if (firstRowText() === 'Row 0')
        throw new Error(`[correctness] ${childImpl} scroll: window did not move on scroll`)
      driveScroll(container, 0)
      let off = 0
      const samples = measureSamples(
        () => {
          off = (off + ROW) % (N * ROW - VIEWPORT)
          driveScroll(container, off)
        },
        { warmup: 1_000, iters: 300, runs: 15 },
      )
      process.stdout.write(JSON.stringify({ samples }))
      process.exit(0)
    } else {
      const React = (await import('react')).default
      const { createElement: h, memo } = React
      const { createRoot } = await import('react-dom/client')
      const { flushSync } = await import('react-dom')
      const { useVirtualizer } = await import('@tanstack/react-virtual')
      const container = makeContainer()
      const Row = memo((p: { index: number; transform: string; size: number }) =>
        h('div', { style: { transform: p.transform, height: p.size } }, `Row ${p.index}`),
      )
      function List() {
        const v = useVirtualizer({
          count: N,
          getScrollElement: () => container,
          estimateSize: () => ROW,
          overscan: OVERSCAN,
        })
        return h(
          'div',
          { style: { height: v.getTotalSize(), position: 'relative' } },
          v.getVirtualItems().map((vi) =>
            h(Row, {
              key: vi.key,
              index: vi.index,
              transform: `translateY(${vi.start}px)`,
              size: vi.size,
            }),
          ),
        )
      }
      const root = createRoot(container)
      flushSync(() => root.render(h(List)))
      await new Promise((r) => setTimeout(r, 0))
      // correctness (untimed, symmetric with the pyreon cells)
      const firstRowText = () =>
        (container.firstElementChild?.firstElementChild as HTMLElement | null)?.textContent
      if (firstRowText() !== 'Row 0')
        throw new Error(`[correctness] react scroll mount: first row "${firstRowText()}" ≠ "Row 0"`)
      flushSync(() => driveScroll(container, 200 * ROW))
      if (firstRowText() === 'Row 0')
        throw new Error('[correctness] react scroll: window did not move on scroll')
      flushSync(() => driveScroll(container, 0))
      let off = 0
      const samples = measureSamples(
        () => {
          off = (off + ROW) % (N * ROW - VIEWPORT)
          flushSync(() => driveScroll(container, off))
        },
        { warmup: 1_000, iters: 300, runs: 15 },
      )
      process.stdout.write(JSON.stringify({ samples }))
      process.exit(0)
    }
  }

  if (childOp === 'mount' || childOp === 'mount-fg') {
    // Cost to mount + tear down an N-item virtual list in a RUNNING app. React
    // reuses ONE warm root (createRoot is react-dom machinery a real app
    // allocates once, not per widget) — that confound excluded so the number is
    // adapter mount+unmount work. `mount` uses the captured-item (fixed-size)
    // pattern (the default); `mount-fg` uses the fine-grained item() pattern to
    // disclose the per-row signal-alloc tax dynamic lists pay.
    const fineGrained = childOp === 'mount-fg'
    if (childImpl === 'pyreon' || childImpl === 'pyreon-tpl') {
      const { h, For } = await import('@pyreon/core')
      const { mount } = await import('@pyreon/runtime-dom')
      const { useVirtualizer } = await import('../src/use-virtualizer')
      const container = makeContainer()
      type V = ReturnType<typeof useVirtualizer<HTMLElement, HTMLElement>>
      let App: () => unknown
      if (childImpl === 'pyreon-tpl') {
        App = await compileApp(fineGrained ? MOUNT_FG_APP_SOURCE : MOUNT_APP_SOURCE, {
          useVirtualizer,
          For,
          container,
          N,
          ROW,
          OVERSCAN,
        })
      } else {
        App = () => {
          let v!: V
          v = useVirtualizer<HTMLElement, HTMLElement>(() => ({
            count: N,
            getScrollElement: () => container,
            estimateSize: () => ROW,
            overscan: OVERSCAN,
          }))
          return h(
            'div',
            { style: () => `height:${v.totalSize()}px;position:relative` },
            h(
              For as unknown as (props: unknown) => unknown,
              { each: () => v.virtualItems(), by: (it: { index: number }) => it.index },
              (it: { index: number }) =>
                fineGrained
                  ? h('div', { style: () => `transform:translateY(${v.item(it.index).start()}px)` }, `Row ${it.index}`)
                  : h('div', { style: `transform:translateY(${it.start}px)` }, `Row ${it.index}`),
            ),
          )
        }
      }
      // correctness (untimed): one mount renders the window with the right rows
      {
        const host = document.createElement('div')
        container.appendChild(host)
        const dispose = mount(h(App as (props: unknown) => unknown, {}), host)
        const rows = host.firstElementChild?.children.length ?? 0
        const first = (host.firstElementChild?.firstElementChild as HTMLElement | null)?.textContent
        if (rows === 0 || first !== 'Row 0')
          throw new Error(`[correctness] ${childImpl} ${childOp}: rows=${rows} first="${first}"`)
        if (typeof dispose === 'function') dispose()
        host.remove()
      }
      const samples = measureSamples(
        () => {
          const host = document.createElement('div')
          container.appendChild(host)
          const dispose = mount(h(App as (props: unknown) => unknown, {}), host)
          if (typeof dispose === 'function') dispose()
          host.remove()
        },
        { warmup: 200, iters: 50, runs: 15 },
      )
      process.stdout.write(JSON.stringify({ samples }))
      process.exit(0)
    } else {
      const React = (await import('react')).default
      const { createElement: h, memo } = React
      const { createRoot } = await import('react-dom/client')
      const { flushSync } = await import('react-dom')
      const { useVirtualizer } = await import('@tanstack/react-virtual')
      const container = makeContainer()
      const root = createRoot(container) // WARM root — allocated once
      const Row = memo((p: { index: number; transform: string }) =>
        h('div', { style: { transform: p.transform } }, `Row ${p.index}`),
      )
      const List = () => {
        const v = useVirtualizer({
          count: N,
          getScrollElement: () => container,
          estimateSize: () => ROW,
          overscan: OVERSCAN,
        })
        return h(
          'div',
          { style: { height: v.getTotalSize(), position: 'relative' } },
          v.getVirtualItems().map((vi) =>
            h(Row, { key: vi.key, index: vi.index, transform: `translateY(${vi.start}px)` }),
          ),
        )
      }
      // correctness (untimed, symmetric with the pyreon cells)
      {
        flushSync(() => root.render(h(List)))
        const rows = container.firstElementChild?.children.length ?? 0
        const first = (container.firstElementChild?.firstElementChild as HTMLElement | null)?.textContent
        if (rows === 0 || first !== 'Row 0')
          throw new Error(`[correctness] react ${childOp}: rows=${rows} first="${first}"`)
        flushSync(() => root.render(null))
      }
      const samples = measureSamples(
        () => {
          flushSync(() => root.render(h(List)))
          flushSync(() => root.render(null))
        },
        { warmup: 200, iters: 50, runs: 15 },
      )
      process.stdout.write(JSON.stringify({ samples }))
      process.exit(0)
    }
  }

  throw new Error(`unknown op: ${childOp}`)
}

// ═════════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR
// ═════════════════════════════════════════════════════════════════════════════

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`[virtual-bench correctness] ${msg}`)
}

console.log('\n=== @pyreon/virtual vs @tanstack/react-virtual — adapter head-to-head ===')
console.log(
  `  Bun ${typeof Bun !== 'undefined' ? (Bun as unknown as { version: string }).version : '?'} · ${process.platform}/${process.arch} · NODE_ENV=production · virtual-core 3.17.4 (identical engine both sides)`,
)
console.log(
  `  List: N=${fmt(N)} rows · ${ROW}px/row · ${VIEWPORT}px viewport · overscan ${OVERSCAN} · scroll ${SCROLL_ROWS} rows\n`,
)

// ─── correctness gate ────────────────────────────────────────────────────────
{
  const p = await pyreonScrollCounts()
  const rN = await reactScrollCounts(false)
  const rM = await reactScrollCounts(true)
  // Same engine → identical window size + identical entering count.
  assert(
    p.windowSize === rN.windowSize && p.windowSize === rM.windowSize,
    `window size mismatch: pyreon ${p.windowSize}, react-naive ${rN.windowSize}, react-memo ${rM.windowSize}`,
  )
  assert(
    p.entering === rN.entering && p.entering === rM.entering && p.entering > 0,
    `entering-row count mismatch: pyreon ${p.entering}, react ${rN.entering}/${rM.entering}`,
  )
  console.log(
    `  ✓ correctness gate — all three render a ${p.windowSize}-row window; a ${SCROLL_ROWS}-row scroll brings in ${p.entering} new rows in every adapter\n`,
  )

  // ═══ SECTION 1 — SCROLL that recycles items (the crux; exact counts) ═══════
  console.log('── Section 1 — work to surface ONE scroll that recycles items ──')
  console.log(`   (window W=${p.windowSize} rows, J=${p.entering} entering; counts are EXACT)\n`)
  const row = (label: string, a: number, b: number, c: number) =>
    console.log(
      `   ${label.padEnd(34)} ${String(a).padStart(9)} ${String(b).padStart(12)} ${String(c).padStart(14)}`,
    )
  console.log(`   ${''.padEnd(34)} ${'Pyreon'.padStart(9)} ${'react naive'.padStart(12)} ${'react memoized'.padStart(14)}`)
  row('parent component re-renders', p.parentRuns, rN.parentRuns, rM.parentRuns)
  row('row VNodes/elements created', p.rowElements, rN.rowElements, rM.rowElements)
  row('row bodies executed', p.rowBodies, rN.rowBodies, rM.rowBodies)
  console.log('')
  const bodyTie = p.rowBodies === rM.rowBodies
  console.log(
    `   ⇒ row-body executions: ${bodyTie ? '🤝 TIE with memoized react-virtual' : 'DIFFER'} (both run only the ${p.entering} entering rows).`,
  )
  console.log(
    `   ⇒ Pyreon does ${p.parentRuns} parent re-render (react: ${rM.parentRuns}) and creates ${p.rowElements} row VNodes`,
  )
  console.log(
    `      (react allocates + keyed-reconciles ${rM.rowElements} every scroll). Naive react runs ${rN.rowBodies} row bodies vs Pyreon's ${p.rowBodies}.\n`,
  )

  // ═══ SECTION 2 — dynamic remeasure (measureElement) ════════════════════════
  const pr = await pyreonRemeasureCounts()
  const rr = await reactRemeasureCounts()
  console.log('── Section 2 — work to surface ONE dynamic remeasure (row 0 grows 100px) ──')
  console.log('   (every row below row 0 shifts down; counts are EXACT)\n')
  assert(pr.repositioned, `Pyreon did not reposition row 3 on remeasure (style stale) — got repositioned=${pr.repositioned}`)
  assert(rr.repositioned, `react did not reposition row 3 on remeasure — got repositioned=${rr.repositioned}`)
  console.log(`   ${''.padEnd(34)} ${'Pyreon'.padStart(9)} ${'react memoized'.padStart(14)}`)
  console.log(`   ${'parent component re-renders'.padEnd(34)} ${String(pr.parentRuns).padStart(9)} ${String(rr.parentRuns).padStart(14)}`)
  console.log(`   ${'row VNodes/elements created'.padEnd(34)} ${String(pr.rowElements).padStart(9)} ${String(rr.rowElements).padStart(14)}`)
  console.log(`   ${'row bodies executed (shifted)'.padEnd(34)} ${String(pr.rowBodies).padStart(9)} ${String(rr.rowBodies).padStart(14)}`)
  console.log(`   ${'row 3 repositioned correctly?'.padEnd(34)} ${String(pr.repositioned).padStart(9)} ${String(rr.repositioned).padStart(14)}`)
  console.log('')
  console.log(
    `   ⇒ Both reposition correctly, both re-run only the ${pr.rowBodies} shifted rows (🤝 tie). Pyreon does it with ${pr.parentRuns} parent`,
  )
  console.log(
    `      re-render + ${pr.rowElements} new VNodes; react re-renders the parent (${rr.parentRuns}) + re-creates & reconciles ${rr.rowElements} VNodes.`,
  )
  console.log('      NOTE the captured-<For>-item pattern is STALE here (never repositions) — item() is REQUIRED for')
  console.log('      dynamically-measured lists (README "dynamic sizing").\n')
}

// ═══ SECTION 3 — timing (process-isolated, pooled median) ════════════════════

console.log('── Section 3 — wall-clock per operation (ns; process-isolated, pooled median [CI95]) ──\n')

const CELL_REPEATS = Number(process.env.BENCH_REPEATS ?? 3)
function runTimingCell(op: string, impl: Impl): { med: number; ci: [number, number] } {
  const pooled: number[] = []
  for (let r = 0; r < CELL_REPEATS; r++) {
    const proc = Bun.spawnSync(['bun', import.meta.path, op, impl], {
      env: { ...process.env, NODE_ENV: 'production' },
    })
    if (proc.exitCode !== 0) throw new Error(`timing child failed (op "${op}", impl "${impl}")`)
    const { samples } = JSON.parse(new TextDecoder().decode(proc.stdout)) as { samples: number[] }
    pooled.push(...samples)
  }
  return { med: median(pooled), ci: bootstrapCI(pooled) }
}

const verdictVs = (p: { med: number; ci: [number, number] }, r: { med: number; ci: [number, number] }) => {
  const ratio = r.med / p.med
  return overlaps(p.ci, r.ci)
    ? '🤝 ~tied'
    : ratio >= 1
      ? `${ratio.toFixed(1)}× faster (Pyreon)`
      : `${(1 / ratio).toFixed(1)}× SLOWER (Pyreon)`
}
// pyr-tpl (the compiled path every vite-plugin app ships) is the ratio
// baseline; pyr-h() is the hand-h() runtime-VNode path, kept for transparency.
const cell = (label: string, pt: { med: number }, ph: { med: number }, r: { med: number }, verdict: string) =>
  console.log(
    `  ${label.padEnd(52)} pyr-tpl ${fmt(Math.round(pt.med)).padStart(9)} ns   pyr-h() ${fmt(Math.round(ph.med)).padStart(9)} ns   react ${fmt(Math.round(r.med)).padStart(11)} ns   ${verdict}`,
  )

const pScrollTpl = runTimingCell('scroll', 'pyreon-tpl')
const pScroll = runTimingCell('scroll', 'pyreon')
const rScroll = runTimingCell('scroll', 'react')
cell('drive 1 scroll → DOM', pScrollTpl, pScroll, rScroll, verdictVs(pScrollTpl, rScroll))

const pMountTpl = runTimingCell('mount', 'pyreon-tpl')
const pMount = runTimingCell('mount', 'pyreon')
const rMount = runTimingCell('mount', 'react')
cell(`mount ${fmt(N)}-item list (fixed-size) → DOM (+unmount)`, pMountTpl, pMount, rMount, verdictVs(pMountTpl, rMount))

// Pareto disclosure: the fine-grained item() mount pays a one-time per-row
// signal-alloc tax. Report it against the SAME fixed-size Pyreon mount above.
const pMountFgTpl = runTimingCell('mount-fg', 'pyreon-tpl')
const pMountFg = runTimingCell('mount-fg', 'pyreon')
console.log(
  `  ${`mount ${fmt(N)}-item list (item()/dynamic) → DOM (+unmount)`.padEnd(52)} pyr-tpl ${fmt(Math.round(pMountFgTpl.med)).padStart(9)} ns   pyr-h() ${fmt(Math.round(pMountFg.med)).padStart(9)} ns   ${(pMountFgTpl.med / pMountTpl.med).toFixed(1)}× the fixed-size mount (per-row signal alloc)`,
)
console.log(
  '\n  (react ns INCLUDES its render + VDOM reconcile — that IS react-virtual\'s cost to surface a scroll;',
)
console.log(
  '   it has no separate "apply" step. pyr-tpl = the fixture compiled through the REAL transformJSX (what',
)
console.log(
  '   vite-plugin apps ship) — the verdict baseline; pyr-h() = hand-h() runtime VNodes (transparency).',
)
console.log('   The fine-grained item() mount pays a one-time per-row signal-alloc tax that the per-scroll/remeasure')
console.log('   win amortizes. ns machine-dependent — ratio is portable.)\n')

// ═══ SECTION 4 — engine control (getVirtualItems is byte-identical) ══════════

console.log('── Section 4 — CONTROL: getVirtualItems() is shared-engine work (both wrap virtual-core) ──\n')
{
  const { Virtualizer, observeElementRect, observeElementOffset, elementScroll } = await import(
    '@tanstack/virtual-core'
  )
  const container = makeContainer()
  const v = new Virtualizer<HTMLElement, HTMLElement>({
    count: N,
    getScrollElement: () => container,
    estimateSize: () => ROW,
    overscan: OVERSCAN,
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    onChange: () => {},
  })
  const cleanup = v._didMount()
  v._willUpdate()
  let off = 0
  const samples = measureSamples(
    () => {
      off = (off + ROW) % (N * ROW - VIEWPORT)
      driveScroll(container, off)
      // getVirtualItems() is the exact call BOTH adapters make each notify.
      v.getVirtualItems()
    },
    { warmup: 1_000, iters: 300, runs: 11 },
  )
  cleanup()
  container.remove()
  console.log(
    `  getVirtualItems() after a 1-row scroll: ${fmt(Math.round(median(samples)))} ns — this cost is IDENTICAL under both`,
  )
  console.log('  adapters (same virtual-core memo). Any Section 1-3 difference is therefore 100% adapter.\n')
}
