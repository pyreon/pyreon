import type { VNodeChild } from "@pyreon/core";
import { effect } from "@pyreon/reactivity";
import type { EChartsOption } from "echarts";
import type { ECElementEvent } from "echarts/core";
import type { ChartProps } from "./types";
import { useChart } from "./use-chart";

/**
 * Handler type that bridges our duck-typed ChartEventParams with
 * echarts' internal ECElementEvent. Used for event binding casts.
 */
type ECHandler = (params: ECElementEvent) => boolean | undefined;

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
  });

  // Bind events when instance is ready
  effect(() => {
    const inst = chart.instance();
    if (!inst) return;

    // Handlers are duck-typed ChartEventParams — cast through unknown
    // to ECHandler because echarts/core and echarts export incompatible
    // private class types for ECElementEvent.
    if (props.onClick) inst.on("click", props.onClick as unknown as ECHandler);
    if (props.onMouseover) inst.on("mouseover", props.onMouseover as unknown as ECHandler);
    if (props.onMouseout) inst.on("mouseout", props.onMouseout as unknown as ECHandler);
  });

  return () => <div ref={chart.ref} style={props.style} class={props.class} />;
}
