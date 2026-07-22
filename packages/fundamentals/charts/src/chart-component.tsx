import type { VNodeChild } from '@pyreon/core'
import { effect, onCleanup } from '@pyreon/reactivity'
import type { EChartsOption } from 'echarts'
import type { ChartEventHandler, ChartEventParams, ChartProps } from './types'
import { useChart } from './use-chart'

// Bare `process.env.NODE_ENV !== 'production'` — bundler-agnostic library
// convention used by React/Vue/Solid. See .claude/rules/anti-patterns.md.

/**
 * The listener shape ECharts' generic `on(eventName: string, handler)`
 * overload accepts. Our wrapped handlers read `args[0]` as the event params.
 */
type ECHandler = (...args: unknown[]) => void

/**
 * Reactive chart component. Wraps useChart in a div with automatic
 * event binding.
 *
 * @example
 * ```tsx
 * // Default — any chart type
 * <Chart
 *   options={() => ({
 *     series: [{ type: 'bar', data: revenue() }],
 *     tooltip: {},
 *   })}
 *   style="height: 400px"
 * />
 *
 * // Any ECharts event (not just the mouse shorthands) + reactive loading
 * <Chart
 *   options={() => ({ legend: {}, series: [{ type: 'pie', data: segments() }] })}
 *   showLoading={isFetching()}
 *   onEvents={{
 *     legendselectchanged: (p) => console.log('toggled', p.name),
 *     datazoom: (_p, instance) => syncOtherChart(instance.getOption()),
 *   }}
 *   style="height: 400px"
 * />
 *
 * // Strict — only specific chart types
 * import type { ComposeOption, BarSeriesOption } from '@pyreon/charts'
 * <Chart<ComposeOption<BarSeriesOption>>
 *   options={() => ({
 *     series: [{ type: 'bar', data: revenue() }],
 *   })}
 *   style="height: 400px"
 * />
 * ```
 */
export function Chart<TOption extends EChartsOption = EChartsOption>(
  props: ChartProps<TOption>,
): VNodeChild {
  const chart = useChart(props.options, {
    // Theme is normalized to the ACCESSOR form so it is reactive both ways:
    // a user-supplied accessor (`theme={() => mode()}`) passes through, and
    // a signal-read VALUE (`theme={mode()}` — a compiler `_rp` getter-backed
    // reactive prop) becomes live because `() => props.theme` re-reads the
    // getter per swap check. A theme VALUE is string | object, never a
    // function, so the typeof discrimination is unambiguous.
    ...(props.theme != null
      ? {
          theme: () => {
            const t = props.theme
            return typeof t === 'function' ? t() : t
          },
        }
      : {}),
    ...(props.renderer != null ? { renderer: props.renderer } : {}),
    ...(props.locale != null ? { locale: props.locale } : {}),
    ...(props.group != null ? { group: props.group } : {}),
    ...(props.initOptions != null ? { initOptions: props.initOptions } : {}),
    ...(props.autoresize != null ? { autoresize: props.autoresize } : {}),
    ...(props.notMerge != null ? { notMerge: props.notMerge } : {}),
    ...(props.replaceMerge != null ? { replaceMerge: props.replaceMerge } : {}),
    ...(props.lazyUpdate != null ? { lazyUpdate: props.lazyUpdate } : {}),
    ...(props.silent != null ? { silent: props.silent } : {}),
    ...(props.transition != null ? { transition: props.transition } : {}),
    ...(props.onInit != null ? { onInit: props.onInit } : {}),
  })

  // Bind events when the instance is ready.
  //
  // `onEvents` is the general form (any ECharts event); `onClick` /
  // `onMouseover` / `onMouseout` are shorthands merged in (shorthand WINS on
  // a key collision). Binding is leak-safe: `onCleanup` runs `inst.off(...)`
  // for every listener this pass bound BEFORE the effect re-runs, so a
  // reactive handler prop that re-fires this effect can never pile up
  // duplicate listeners (the latent bug of a bare `inst.on(...)` that never
  // `.off()`s). All listeners are also removed on dispose.
  effect(() => {
    const inst = chart.instance()
    if (!inst) return

    const handlers: Record<string, ChartEventHandler> = { ...props.onEvents }
    if (props.onClick) handlers.click = props.onClick
    if (props.onMouseover) handlers.mouseover = props.onMouseover
    if (props.onMouseout) handlers.mouseout = props.onMouseout

    // Each entry: the event name + the exact wrapped listener we registered,
    // so `.off()` removes precisely what we `.on()`'d (ECharts allows many
    // listeners per event — removing by name alone would drop the user's own).
    const bound: [string, ECHandler][] = []
    for (const name in handlers) {
      const fn = handlers[name]
      if (!fn) continue
      // Wrap so the handler also gets the live instance as a 2nd arg. ECharts'
      // generic string-event overload types the params as `unknown`, so read
      // `args[0]` back to our duck-typed ChartEventParams.
      const wrapped: ECHandler = (...args) => fn(args[0] as ChartEventParams, inst)
      inst.on(name, wrapped)
      bound.push([name, wrapped])
    }
    onCleanup(() => {
      for (const [name, wrapped] of bound) inst.off(name, wrapped)
    })
  })

  // ECharts built-in loading overlay — reactive. `showLoading` toggles
  // `inst.showLoading()`/`hideLoading()` as the signal flips; `loadingOption`
  // customizes the overlay. Distinct from `chart.loading` (module load).
  effect(() => {
    const inst = chart.instance()
    if (!inst) return
    if (props.showLoading) {
      inst.showLoading('default', props.loadingOption)
    } else {
      inst.hideLoading()
    }
  })

  // Surface load/render errors. Without this, a chart that fails to mount
  // (missing tslib alias, network failure on a lazy ECharts chunk, etc.)
  // silently renders as an empty div — the user has no way to know WHY
  // their chart isn't visible (W12 from #942). Always log to console.error
  // in dev; in production, log when first seen so deployment-time failures
  // are at least visible to ops via browser devtools.
  let lastLoggedError: unknown = null
  effect(() => {
    const err = chart.error()
    if (err && err !== lastLoggedError) {
      lastLoggedError = err
      // Intentional production error log (see comment above) — deployment-time
      // render failures must reach ops via browser devtools, so this is
      // deliberately NOT dev-gated.
      // pyreon-lint-disable-next-line pyreon/dev-guard-warnings
      console.error('[@pyreon/charts] Chart failed to render:', err) // eslint-disable-line no-console
    }
  })

  return () => {
    const err = chart.error()
    if (err && process.env.NODE_ENV !== 'production') {
      // Dev-only: inline error display so the user can see the problem
      // without opening devtools. In production we keep the empty div
      // to avoid leaking internals; the console.error above still fires.
      const message = err instanceof Error ? err.message : String(err)
      return (
        <div
          data-pyreon-chart-error="true"
          style={props.style}
          class={props.class}
          // CSS-in-style so consumers don't need our stylesheet to see the error.
          // Standard error-callout look.
        >
          <pre style="margin:0;padding:12px;background:#fff5f5;border:1px solid #ff6b6b;border-radius:4px;color:#c92a2a;font-family:ui-monospace,monospace;font-size:12px;white-space:pre-wrap;overflow:auto;max-height:100%">
            {message}
          </pre>
        </div>
      )
    }
    // A chart is canvas/SVG — opaque to assistive tech. When the consumer
    // supplies `ariaLabel`, present the container as a single labeled image
    // (the WAI pattern for a complex graphic); without it, leave the div bare
    // (a nameless role="img" is worse than none), so there's no regression.
    return (
      <div
        ref={chart.ref}
        style={props.style}
        class={props.class}
        role={props.ariaLabel ? 'img' : undefined}
        aria-label={props.ariaLabel}
      />
    )
  }
}
