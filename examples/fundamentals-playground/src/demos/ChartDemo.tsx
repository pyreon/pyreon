import type { EChartsOption } from "@pyreon/charts";
import { Chart } from "@pyreon/charts";
import { computed, signal } from "@pyreon/reactivity";

export function ChartDemo() {
  // ─── Bar chart data ────────────────────────────────────────────────────────
  const months = signal(["Jan", "Feb", "Mar", "Apr", "May", "Jun"]);
  const revenue = signal([120, 200, 150, 80, 270, 310]);
  const profit = signal([40, 80, 50, 20, 110, 140]);

  // ─── Pie chart data ────────────────────────────────────────────────────────
  const pieData = signal([
    { name: "Desktop", value: 1048 },
    { name: "Mobile", value: 735 },
    { name: "Tablet", value: 580 },
    { name: "Other", value: 484 },
  ]);

  // ─── Gauge value ───────────────────────────────────────────────────────────
  const gaugeValue = signal(72);

  // ─── Chart type selector ───────────────────────────────────────────────────
  const chartType = signal<"bar" | "line" | "scatter">("bar");

  const barOptions = computed<EChartsOption>(() => ({
    title: { text: "Revenue & Profit", left: "center" },
    tooltip: { trigger: "axis" },
    legend: { bottom: 0 },
    xAxis: { type: "category", data: months() },
    yAxis: { type: "value", name: "$K" },
    series: [
      {
        name: "Revenue",
        type: chartType(),
        data: revenue(),
        itemStyle: { color: "#5470c6" },
      },
      {
        name: "Profit",
        type: chartType(),
        data: profit(),
        itemStyle: { color: "#91cc75" },
      },
    ],
  }));

  const pieOptions = computed<EChartsOption>(() => ({
    title: { text: "Device Share", left: "center" },
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    series: [
      {
        type: "pie",
        radius: ["40%", "70%"],
        data: pieData(),
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.3)" },
        },
      },
    ],
  }));

  const gaugeOptions = computed<EChartsOption>(() => ({
    series: [
      {
        type: "gauge",
        detail: { formatter: "{value}%" },
        data: [{ value: gaugeValue(), name: "Performance" }],
        axisLine: { lineStyle: { width: 20 } },
      },
    ],
  }));

  const log = signal<string[]>([]);
  const addLog = (msg: string) => log.update((l) => [...l.slice(-9), msg]);

  return (
    <div>
      <h2>Charts</h2>
      <p class="desc">
        Reactive ECharts bridge with lazy loading. Zero ECharts bytes until a chart renders —
        modules are auto-detected and dynamically imported. Signal reads inside options functions
        trigger reactive updates.
      </p>

      {/* Bar / Line / Scatter chart */}
      <div class="section">
        <h3>Revenue Chart — Reactive Type Switching</h3>
        <div class="row" style="margin-bottom: 8px">
          {(["bar", "line", "scatter"] as const).map((type) => (
            <button
              type="button"
              key={type}
              class={chartType() === type ? "active" : ""}
              onClick={() => {
                chartType.set(type);
                addLog(`Chart type → ${type}`);
              }}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
        <Chart options={() => barOptions()} style="height: 300px; width: 100%" />
        <div class="row" style="margin-top: 8px">
          <button
            type="button"
            onClick={() => {
              revenue.update((r) => r.map((v) => v + Math.round(Math.random() * 40 - 20)));
              addLog("Revenue data randomized");
            }}
          >
            Randomize Revenue
          </button>
          <button
            type="button"
            onClick={() => {
              months.update((m) => [...m, `M${m.length + 1}`]);
              revenue.update((r) => [...r, Math.round(Math.random() * 300)]);
              profit.update((p) => [...p, Math.round(Math.random() * 150)]);
              addLog("Added month");
            }}
          >
            Add Month
          </button>
        </div>
      </div>

      {/* Pie chart */}
      <div class="section">
        <h3>Donut Chart — Device Share</h3>
        <Chart options={() => pieOptions()} style="height: 300px; width: 100%" />
        <div class="row" style="margin-top: 8px">
          <button
            type="button"
            onClick={() => {
              pieData.update((d) =>
                d.map((item) => ({
                  ...item,
                  value: Math.round(Math.random() * 1500),
                })),
              );
              addLog("Pie data randomized");
            }}
          >
            Randomize Values
          </button>
        </div>
      </div>

      {/* Gauge */}
      <div class="section">
        <h3>Gauge — Performance Score</h3>
        <Chart options={() => gaugeOptions()} style="height: 250px; width: 100%" />
        <div class="row" style="margin-top: 8px">
          <button
            type="button"
            onClick={() => {
              gaugeValue.update((v) => Math.max(0, v - 10));
              addLog(`Gauge → ${gaugeValue()}%`);
            }}
          >
            -10
          </button>
          <span>
            Value: <strong>{() => gaugeValue()}%</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              gaugeValue.update((v) => Math.min(100, v + 10));
              addLog(`Gauge → ${gaugeValue()}%`);
            }}
          >
            +10
          </button>
        </div>
      </div>

      {/* API info */}
      <div class="section">
        <h3>How It Works</h3>
        <p style="font-size: 13px; opacity: 0.7; line-height: 1.6">
          <code>{"<Chart options={() => ({ ... })} />"}</code> auto-detects chart types (bar, pie,
          gauge, etc.) from your config and dynamically imports only the needed ECharts modules.
          Signal reads inside the options function trigger reactive updates — change data, change
          the chart. Canvas renderer by default, SVG optional via <code>renderer="svg"</code>.
        </p>
      </div>

      {/* Log */}
      <div class="section">
        <h3>Change Log</h3>
        <div class="log">
          {() =>
            log().length === 0 ? "Interact with the charts above to see changes." : log().join("\n")
          }
        </div>
      </div>
    </div>
  );
}
