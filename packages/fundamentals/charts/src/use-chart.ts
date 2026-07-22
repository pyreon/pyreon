import { onUnmount } from '@pyreon/core'
import { effect, signal, untrack } from '@pyreon/reactivity'
import type { EChartsOption } from 'echarts'
import { ensureModules, ensureModulesSync, getCoreSync } from './loader'
import type { ChartTheme, UseChartConfig, UseChartResult } from './types'

/**
 * @internal — exported for testing only.
 *
 * Leading + trailing throttle for the autoresize callback. First call fires
 * immediately; calls within `ms` coalesce into ONE trailing call so the
 * final container size is always applied. `cancel()` clears the pending
 * trailing timer (leak-class I — must run on unmount so no timer outlives
 * the chart).
 */
export function _throttle(fn: () => void, ms: number): { run: () => void; cancel: () => void } {
  let last = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  const invoke = (): void => {
    last = Date.now()
    fn()
  }
  return {
    run() {
      const remaining = ms - (Date.now() - last)
      if (remaining <= 0) {
        if (timer != null) {
          clearTimeout(timer)
          timer = null
        }
        invoke()
      } else if (timer == null) {
        timer = setTimeout(() => {
          timer = null
          invoke()
        }, remaining)
      }
    },
    cancel() {
      if (timer != null) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}

/**
 * Reactive ECharts hook. Creates a chart instance bound to a container
 * element, with automatic module lazy-loading, signal tracking, resize
 * handling, error capture, and cleanup.
 *
 * Generic parameter `TOption` narrows the option type for exact autocomplete.
 * Use `ComposeOption<SeriesUnion>` from ECharts to restrict to specific chart types.
 *
 * @example
 * ```tsx
 * // Default — accepts any ECharts option
 * const chart = useChart(() => ({
 *   series: [{ type: 'bar', data: revenue() }],
 * }))
 *
 * // Reactive theme — accessor form; a flip disposes + re-inits with the
 * // current option preserved (ECharts has no in-place theme swap)
 * const chart = useChart(optionsFn, { theme: () => (dark() ? 'dark' : null) })
 *
 * // Strict — only bar + line allowed, full autocomplete
 * import type { ComposeOption, BarSeriesOption, LineSeriesOption } from '@pyreon/charts'
 * type MyChartOption = ComposeOption<BarSeriesOption | LineSeriesOption>
 *
 * const chart = useChart<MyChartOption>(() => ({
 *   series: [{ type: 'bar', data: revenue() }],  // ✓
 * }))
 * ```
 */
export function useChart<TOption extends EChartsOption = EChartsOption>(
  optionsFn: () => TOption,
  config?: UseChartConfig,
): UseChartResult {
  const instance = signal<import('echarts/core').ECharts | null>(null)
  const loading = signal(true)
  const error = signal<Error | null>(null)
  const container = signal<HTMLElement | null>(null)
  const renderer = config?.renderer ?? 'canvas'

  let observer: ResizeObserver | null = null
  let cancelResizeThrottle: (() => void) | null = null
  let initialized = false
  // Theme the LIVE instance was created with — the reactive-theme effect
  // compares the accessor's current value against it to decide whether a
  // dispose + re-init is needed. Only meaningful once an instance exists.
  let appliedTheme: ChartTheme | null = null

  /** Resolve the configured theme (value or accessor) to its current value. */
  const resolveTheme = (): ChartTheme | null => {
    const t = config?.theme
    return (typeof t === 'function' ? t() : t) ?? null
  }

  /**
   * Create the ECharts instance on `el` with the CURRENT theme and publish
   * it. Shared by the sync fast path, the async module-load path, and the
   * reactive-theme re-init. Callers wrap in `untrack` when running inside a
   * tracked frame (theme/option reads here must not subscribe the caller's
   * effect).
   */
  const createInstance = (core: typeof import('echarts/core'), el: HTMLElement): void => {
    const theme = resolveTheme()
    const chart = core.init(el, theme as string | object | null, {
      renderer,
      ...(config?.locale != null ? { locale: config.locale } : {}),
      ...(config?.devicePixelRatio != null ? { devicePixelRatio: config.devicePixelRatio } : {}),
      ...(config?.width != null ? { width: config.width } : {}),
      ...(config?.height != null ? { height: config.height } : {}),
      // Escape hatch LAST — initOptions wins on a key collision so consumers
      // can reach init flags this config doesn't model (useDirtyRect, …).
      ...config?.initOptions,
    })
    if (config?.group != null) chart.group = config.group
    appliedTheme = theme

    // NOTE: no `chart.setOption(opts)` here. Publishing the instance
    // synchronously re-runs the reactive-update effect below (it is
    // subscribed to `instance()`), which applies the FIRST setOption
    // with the configured `notMerge`/`replaceMerge`/`lazyUpdate` — so a
    // separate init-time setOption would be a redundant SECOND full
    // apply on every mount (measured 2 setOption calls vs 1). The
    // effect runs synchronously inside this `.set`, so the chart is
    // fully configured before `onInit` fires.
    instance.set(chart)
    loading.set(false)
    error.set(null)

    config?.onInit?.(chart)
  }

  /**
   * Attach the autoresize ResizeObserver per config. The callback reads
   * `instance.peek()` per fire (NOT a captured chart), so it survives a
   * reactive-theme re-init untouched — no rebind, and it can never resize
   * a disposed instance.
   */
  const setupAutoresize = (el: HTMLElement): void => {
    const auto = config?.autoresize ?? true
    if (auto === false) return

    const doResize = (): void => {
      instance.peek()?.resize()
    }
    let callback = doResize
    const throttleMs = typeof auto === 'object' ? auto.throttle : undefined
    if (throttleMs != null && throttleMs > 0) {
      const throttled = _throttle(doResize, throttleMs)
      callback = throttled.run
      cancelResizeThrottle = throttled.cancel
    }

    observer = new ResizeObserver(callback)
    observer.observe(el)
  }

  // Why effect() and not onMount() — the consumer pattern binds the
  // container AFTER mount via `chart.ref(el)` (see test fixture
  // `chart.test.tsx`: `chart.ref(el)` is called post-mount). The
  // effect's reactivity to `container()` is what defers chart init
  // until the container is available; `onMount` runs at mount time
  // when `container()` is still null and would never re-fire when
  // `ref()` is invoked later. The `initialized` flag turns the effect
  // into a one-shot init AFTER the container becomes non-null —
  // exactly the contract the API needs. The static lint rule flags
  // this site by name; the suppression is load-bearing.
  // pyreon-lint-disable-next-line pyreon/no-imperative-effect-on-create
  effect(() => {
    const el = container()
    if (!el || initialized) return

    initialized = true

    let opts: EChartsOption
    try {
      opts = optionsFn()
    } catch (err) {
      error.set(err instanceof Error ? err : new Error(String(err)))
      loading.set(false)
      return
    }

    // Fast path: core loaded AND every module this option needs already
    // registered → init synchronously, no promise hop. The 2nd..Nth chart
    // on a page (same chart types) mounts in the same task instead of
    // paying a wrapper-imposed microtask delay. `untrack` so theme/config
    // reads inside createInstance don't subscribe THIS init effect.
    const syncCore = ensureModulesSync(opts as Record<string, unknown>, renderer)
    if (syncCore) {
      try {
        untrack(() => createInstance(syncCore, el))
        setupAutoresize(el)
      } catch (err) {
        error.set(err instanceof Error ? err : new Error(String(err)))
        loading.set(false)
      }
      return
    }

    // Slow path: load required ECharts modules, then create the chart.
    ensureModules(opts as Record<string, unknown>, renderer)
      .then((core) => {
        // Guard: component may have unmounted during async load
        // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
        if (!container.peek()) return

        try {
          createInstance(core, el)
          setupAutoresize(el)
        } catch (err) {
          error.set(err instanceof Error ? err : new Error(String(err)))
          loading.set(false)
        }
      })
      .catch((err) => {
        error.set(err instanceof Error ? err : new Error(String(err)))
        loading.set(false)
      })
  })

  // Reactive theme swap — only wired when `theme` is an ACCESSOR. ECharts
  // has no in-place theme swap, so dispose + re-init IS the mechanism (what
  // vue-echarts does). Publishing the new instance re-runs the reactive-
  // update effect below (current option re-applied from optionsFn) and any
  // consumer effect subscribed to `instance()` — the <Chart> component's
  // event/showLoading effects rebind automatically. `group` is carried over
  // from the live instance (covers a runtime-assigned group, not just
  // config.group); the ResizeObserver needs no rebind (reads instance.peek()
  // per fire).
  if (typeof config?.theme === 'function') {
    const themeFn = config.theme
    effect(() => {
      const theme = themeFn() ?? null // TRACKED — the swap subscription
      const chart = instance.peek()
      // Pre-init (or mid-async-load): nothing to swap — createInstance
      // reads the LIVE accessor value at init time, so this change is
      // picked up there; appliedTheme is recorded at creation.
      if (!chart) return
      if (Object.is(theme, appliedTheme)) return

      const el = container.peek()
      const core = getCoreSync()
      if (!el || !core) return

      const group = chart.group
      chart.dispose()
      try {
        untrack(() => createInstance(core, el))
        const next = instance.peek()
        if (next && group) next.group = group
      } catch (err) {
        // Old instance is disposed and no replacement exists — clear the
        // published instance so consumers don't hold a disposed chart.
        instance.set(null)
        error.set(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  // Reactive updates — re-run when signals in optionsFn change (and when a
  // theme re-init publishes a NEW instance: the fresh instance gets the
  // current option applied here, which is what preserves the option across
  // a theme swap).
  effect(() => {
    const chart = instance()
    if (!chart) return

    try {
      const opts = optionsFn()
      chart.setOption(opts, {
        notMerge: config?.notMerge ?? false,
        ...(config?.replaceMerge != null ? { replaceMerge: config.replaceMerge } : {}),
        lazyUpdate: config?.lazyUpdate ?? true,
        ...(config?.silent != null ? { silent: config.silent } : {}),
        ...(config?.transition != null ? { transition: config.transition } : {}),
      })
      error.set(null)
    } catch (err) {
      error.set(err instanceof Error ? err : new Error(String(err)))
    }
  })

  // Cleanup on unmount
  onUnmount(() => {
    observer?.disconnect()
    observer = null
    cancelResizeThrottle?.()
    cancelResizeThrottle = null

    const chart = instance.peek()
    if (chart) {
      chart.dispose()
      instance.set(null)
    }

    initialized = false
  })

  return {
    ref: (el: Element | null) => container.set(el as HTMLElement | null),
    instance,
    loading,
    error,
    resize: () => instance.peek()?.resize(),
  }
}
