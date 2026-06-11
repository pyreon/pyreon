/** @jsxImportSource @pyreon/core */
import { h } from '@pyreon/core'
import { install } from '@pyreon/perf-harness'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import rocketstyle from '@pyreon/rocketstyle'
import { Button } from '@pyreon/ui-components'
import { init, PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'

// ── Mode switch via URL param — one build serves BOTH modes ──────────────────
// `?vars=1` → CSS-variables mode; otherwise the classic per-component-resolve
// path. The Playwright runner loads the page once per mode (fresh JS heap).
const params = new URLSearchParams(location.search)
const cssVars = params.get('vars') === '1'
const N = Number(params.get('n') ?? '150') // components per group (×2 groups)

if (cssVars) init({ cssVariables: true })

// perf-harness counters live (styler.resolve / rocketstyle.getTheme / …).
install()

const mode = signal<'light' | 'dark'>('light')

// ── A genuinely mode-VARYING component (the real dark-mode-app shape) ─────────
// Default @pyreon/ui-components are mode-agnostic (single palette), so they
// measure the per-flip RE-RESOLUTION cost classic mode pays even when nothing
// visually changes. These mode(a, b) boxes additionally change appearance, so
// the benchmark covers both: re-resolution churn AND real mode-varying styles.
const Base = (props: Record<string, unknown>) =>
  h('div', props, (props as { children?: never }).children)
;(Base as { displayName?: string }).displayName = 'Base'

const ModeBox = (rocketstyle()({ name: 'ModeBox', component: Base }) as any)
  .styles(
    (css: any) => css`
      width: 16px;
      height: 16px;
      display: inline-block;
      border-radius: 3px;
      background-color: ${({ $rocketstyle }: any) => $rocketstyle.bg};
    `,
  )
  .theme((_t: any, m: any) => ({ bg: m('rgb(16, 185, 129)', 'rgb(239, 68, 68)') }))

const STATES = ['primary', 'secondary'] as const
const SIZES = ['small', 'medium', 'large'] as const

function App() {
  const buttons = Array.from({ length: N }, (_, i) =>
    h(
      Button as never,
      { state: STATES[i % 2], size: SIZES[i % 3], 'data-i': i },
      `B${i}`,
    ),
  )
  const boxes = Array.from({ length: N }, (_, i) =>
    h(ModeBox, { id: i === 0 ? 'sentinel' : undefined, 'data-i': i }),
  )
  return h(
    PyreonUI as never,
    { theme, mode: () => mode() },
    h('div', { class: 'grid' }, ...buttons, ...boxes),
  )
}

mount(h(App, null), document.getElementById('app')!)

// ── Benchmark API for the Playwright runner ──────────────────────────────────
interface PerfWin {
  __pyreon_perf__?: { snapshot: () => Record<string, number>; reset: () => void }
}
const perf = () => (window as unknown as PerfWin).__pyreon_perf__

// Force a synchronous style recalc so the timed region includes the work the
// user actually waits for (classic: JS re-resolve + native recalc; vars:
// native recalc only). Reading a computed color flushes pending style.
function forceRecalc(): string {
  const el = document.getElementById('sentinel')
  return el ? getComputedStyle(el).backgroundColor : ''
}

;(window as unknown as { __bench: unknown }).__bench = {
  mode: cssVars ? 'cssVariables' : 'classic',
  components: N * 2,
  flip(): void {
    mode.set(mode.peek() === 'light' ? 'dark' : 'light')
    forceRecalc()
  },
  /** Run `n` flips untimed (JIT warmup). */
  warmup(n: number): void {
    for (let i = 0; i < n; i++) {
      mode.set(mode.peek() === 'light' ? 'dark' : 'light')
      forceRecalc()
    }
  },
  /** Reset counters, run `n` timed flips, return elapsed ms + counter deltas. */
  measure(n: number): { ms: number; counts: Record<string, number> } {
    perf()?.reset()
    const t0 = performance.now()
    for (let i = 0; i < n; i++) {
      mode.set(mode.peek() === 'light' ? 'dark' : 'light')
      forceRecalc()
    }
    const ms = performance.now() - t0
    return { ms, counts: perf()?.snapshot() ?? {} }
  },
  /** Per-flip computed-style sanity: the sentinel's color for the current mode. */
  sentinelColor: forceRecalc,
}
