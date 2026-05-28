import type { VNodeChild } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import type { EChartsOption } from 'echarts'
import type { ECElementEvent } from 'echarts/core'
import type { ChartProps } from './types'
import { useChart } from './use-chart'

// Bare `process.env.NODE_ENV !== 'production'` — bundler-agnostic library
// convention used by React/Vue/Solid. See .claude/rules/anti-patterns.md.
const __DEV__ = process.env.NODE_ENV !== 'production'

/**
 * Handler type that bridges our duck-typed ChartEventParams with
 * echarts' internal ECElementEvent. Used for event binding casts.
 */
type ECHandler = (params: ECElementEvent) => boolean | undefined

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
    ...(props.theme != null ? { theme: props.theme } : {}),
    ...(props.renderer != null ? { renderer: props.renderer } : {}),
  })

  // Bind events when instance is ready
  effect(() => {
    const inst = chart.instance()
    if (!inst) return

    // Handlers are duck-typed ChartEventParams — cast through unknown
    // to ECHandler because echarts/core and echarts export incompatible
    // private class types for ECElementEvent.
    if (props.onClick) inst.on('click', props.onClick as unknown as ECHandler)
    if (props.onMouseover) inst.on('mouseover', props.onMouseover as unknown as ECHandler)
    if (props.onMouseout) inst.on('mouseout', props.onMouseout as unknown as ECHandler)
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
    if (err && __DEV__) {
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
    return <div ref={chart.ref} style={props.style} class={props.class} />
  }
}
