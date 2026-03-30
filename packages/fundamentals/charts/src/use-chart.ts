import { onUnmount } from "@pyreon/core";
import { effect, signal } from "@pyreon/reactivity";
import type { EChartsOption } from "echarts";
import { ensureModules } from "./loader";
import type { UseChartConfig, UseChartResult } from "./types";

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
  const instance = signal<import("echarts/core").ECharts | null>(null);
  const loading = signal(true);
  const error = signal<Error | null>(null);
  const container = signal<HTMLElement | null>(null);
  const renderer = config?.renderer ?? "canvas";

  let observer: ResizeObserver | null = null;
  let initialized = false;

  // Initialize chart when container is bound
  effect(() => {
    const el = container();
    if (!el || initialized) return;

    initialized = true;

    let opts: EChartsOption;
    try {
      opts = optionsFn();
    } catch (err) {
      error.set(err instanceof Error ? err : new Error(String(err)));
      loading.set(false);
      return;
    }

    // Load required ECharts modules, then create chart
    ensureModules(opts as Record<string, unknown>, renderer)
      .then((core) => {
        // Guard: component may have unmounted during async load
        if (!container.peek()) return;

        try {
          const chart = core.init(el, (config?.theme ?? null) as string | object | null, {
            renderer,
            ...(config?.locale != null ? { locale: config.locale } : {}),
            ...(config?.devicePixelRatio != null
              ? { devicePixelRatio: config.devicePixelRatio }
              : {}),
            ...(config?.width != null ? { width: config.width } : {}),
            ...(config?.height != null ? { height: config.height } : {}),
          });

          chart.setOption(opts);
          instance.set(chart);
          loading.set(false);
          error.set(null);

          config?.onInit?.(chart);

          // ResizeObserver for auto-resize
          observer = new ResizeObserver(() => {
            chart.resize();
          });
          observer.observe(el);
        } catch (err) {
          error.set(err instanceof Error ? err : new Error(String(err)));
          loading.set(false);
        }
      })
      .catch((err) => {
        error.set(err instanceof Error ? err : new Error(String(err)));
        loading.set(false);
      });
  });

  // Reactive updates — re-run when signals in optionsFn change
  effect(() => {
    const chart = instance();
    if (!chart) return;

    try {
      const opts = optionsFn();
      chart.setOption(opts, {
        notMerge: config?.notMerge ?? false,
        lazyUpdate: config?.lazyUpdate ?? true,
      });
      error.set(null);
    } catch (err) {
      error.set(err instanceof Error ? err : new Error(String(err)));
    }
  });

  // Cleanup on unmount
  onUnmount(() => {
    observer?.disconnect();
    observer = null;

    const chart = instance.peek();
    if (chart) {
      chart.dispose();
      instance.set(null);
    }

    initialized = false;
  });

  return {
    ref: (el: Element | null) => container.set(el as HTMLElement | null),
    instance,
    loading,
    error,
    resize: () => instance.peek()?.resize(),
  };
}
