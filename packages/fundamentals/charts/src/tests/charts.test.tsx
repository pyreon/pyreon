import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'

// ─── Mock echarts subpath imports ────────────────────────────────────────────
// Mocking these eliminates the wall-clock dependency of real dynamic imports
// under CI load (Vite's dep optimizer fetching ~300KB of echarts/core was
// exceeding the 5s vitest timeout on shared runners). The loader's state
// machine, caching, and auto-detection logic are still fully exercised — only
// the module acquisition is stubbed.

vi.mock('echarts/core', () => {
  const init = vi.fn(() => ({
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }))
  const use = vi.fn()
  return { init, use, default: { init, use } }
})

const makeStub = (name: string) => ({ __echartsStub: name })

vi.mock('echarts/charts', () => ({
  BarChart: makeStub('BarChart'),
  LineChart: makeStub('LineChart'),
  PieChart: makeStub('PieChart'),
  ScatterChart: makeStub('ScatterChart'),
  RadarChart: makeStub('RadarChart'),
  HeatmapChart: makeStub('HeatmapChart'),
  TreemapChart: makeStub('TreemapChart'),
  SunburstChart: makeStub('SunburstChart'),
  SankeyChart: makeStub('SankeyChart'),
  FunnelChart: makeStub('FunnelChart'),
  GaugeChart: makeStub('GaugeChart'),
  GraphChart: makeStub('GraphChart'),
  TreeChart: makeStub('TreeChart'),
  BoxplotChart: makeStub('BoxplotChart'),
  CandlestickChart: makeStub('CandlestickChart'),
  ParallelChart: makeStub('ParallelChart'),
  ThemeRiverChart: makeStub('ThemeRiverChart'),
  EffectScatterChart: makeStub('EffectScatterChart'),
  LinesChart: makeStub('LinesChart'),
  PictorialBarChart: makeStub('PictorialBarChart'),
  CustomChart: makeStub('CustomChart'),
  MapChart: makeStub('MapChart'),
}))

vi.mock('echarts/components', () => ({
  GridComponent: makeStub('GridComponent'),
  PolarComponent: makeStub('PolarComponent'),
  RadarComponent: makeStub('RadarComponent'),
  GeoComponent: makeStub('GeoComponent'),
  TooltipComponent: makeStub('TooltipComponent'),
  LegendComponent: makeStub('LegendComponent'),
  ToolboxComponent: makeStub('ToolboxComponent'),
  TitleComponent: makeStub('TitleComponent'),
  DataZoomComponent: makeStub('DataZoomComponent'),
  VisualMapComponent: makeStub('VisualMapComponent'),
  TimelineComponent: makeStub('TimelineComponent'),
  GraphicComponent: makeStub('GraphicComponent'),
  BrushComponent: makeStub('BrushComponent'),
  CalendarComponent: makeStub('CalendarComponent'),
  DatasetComponent: makeStub('DatasetComponent'),
  AriaComponent: makeStub('AriaComponent'),
  MarkPointComponent: makeStub('MarkPointComponent'),
  MarkLineComponent: makeStub('MarkLineComponent'),
  MarkAreaComponent: makeStub('MarkAreaComponent'),
}))

vi.mock('echarts/renderers', () => ({
  CanvasRenderer: makeStub('CanvasRenderer'),
  SVGRenderer: makeStub('SVGRenderer'),
}))

import { Chart } from '../chart-component'
import { _resetLoader, ensureModules, getCore, getCoreSync, manualUse } from '../loader'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mountWith<T>(fn: () => T): { result: T; unmount: () => void } {
  let result: T | undefined
  const el = document.createElement('div')
  document.body.appendChild(el)
  const Child = () => {
    result = fn()
    return null
  }
  const unmount = mount(<Child />, el)
  return {
    result: result!,
    unmount: () => {
      unmount()
      el.remove()
    },
  }
}

afterEach(() => {
  _resetLoader()
})

// ─── Loader ───────────────────────────────────────────────────────────────────

// Even with `vi.mock` on all `echarts/*` subpaths, tests that fan out 6+
// concurrent `import('echarts/...')` calls (e.g. `auto-detects components
// from config keys`) can exceed the default 5s timeout under loaded CI
// parallel workers — vitest's mock resolution for dynamic imports still
// goes through the Vite module graph per-import, and shared-runner contention
// stacks the microtask chain. Bump the suite timeout so these remain
// deterministic without refactoring the loader to remove `import()` entirely.
describe('loader', { timeout: 15_000 }, () => {
  it('lazily loads echarts/core on first call', async () => {
    const core = await getCore()
    expect(core).toBeDefined()
    expect(typeof core.init).toBe('function')
    expect(typeof core.use).toBe('function')
  })

  it('caches core module on subsequent calls', async () => {
    const core1 = await getCore()
    const core2 = await getCore()
    expect(core1).toBe(core2)
  })

  it('auto-detects BarChart from series type', async () => {
    const core = await ensureModules({
      series: [{ type: 'bar', data: [1, 2, 3] }],
    })
    expect(core).toBeDefined()
    // If it didn't throw, the modules were registered successfully
  })

  it('auto-detects PieChart from series type', async () => {
    const core = await ensureModules({
      series: [{ type: 'pie', data: [{ value: 1 }] }],
    })
    expect(core).toBeDefined()
  })

  it('auto-detects LineChart from series type', async () => {
    const core = await ensureModules({
      series: [{ type: 'line', data: [1, 2, 3] }],
    })
    expect(core).toBeDefined()
  })

  it('auto-detects components from config keys', async () => {
    const core = await ensureModules({
      tooltip: { trigger: 'axis' },
      legend: {},
      xAxis: { type: 'category' },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: [1] }],
    })
    expect(core).toBeDefined()
  })

  it('auto-detects series features (markPoint, markLine, markArea)', async () => {
    const core = await ensureModules({
      series: [
        {
          type: 'line',
          data: [1, 2, 3],
          markPoint: { data: [{ type: 'max' }] },
          markLine: { data: [{ type: 'average' }] },
          markArea: { data: [[{ xAxis: 'A' }, { xAxis: 'B' }]] },
        },
      ],
    })
    expect(core).toBeDefined()
  })

  it('loads multiple chart types in one config', async () => {
    const core = await ensureModules({
      series: [
        { type: 'bar', data: [1, 2] },
        { type: 'line', data: [3, 4] },
        { type: 'scatter', data: [[1, 2]] },
      ],
    })
    expect(core).toBeDefined()
  })

  it('caches modules across calls', async () => {
    // First call loads BarChart
    await ensureModules({ series: [{ type: 'bar', data: [1] }] })
    // Second call should be instant (cached)
    const start = performance.now()
    await ensureModules({ series: [{ type: 'bar', data: [2] }] })
    const duration = performance.now() - start
    // Should be near-instant since modules are cached
    expect(duration).toBeLessThan(50)
  })

  it('handles series as single object (not array)', async () => {
    const core = await ensureModules({
      series: { type: 'bar', data: [1, 2, 3] },
    })
    expect(core).toBeDefined()
  })

  it('handles empty series gracefully', async () => {
    const core = await ensureModules({ series: [] })
    expect(core).toBeDefined()
  })

  it('handles config with no series', async () => {
    const core = await ensureModules({ title: { text: 'Hello' } })
    expect(core).toBeDefined()
  })

  it('ignores unknown chart types', async () => {
    const core = await ensureModules({
      series: [{ type: 'nonexistent', data: [1] }],
    })
    expect(core).toBeDefined()
  })

  it('loads SVG renderer when specified', async () => {
    const core = await ensureModules({ series: [{ type: 'bar', data: [1] }] }, 'svg')
    expect(core).toBeDefined()
  })

  it('resets state with _resetLoader', async () => {
    await getCore() // load core
    _resetLoader()
    // After reset, core should be null internally but getCore still works
    const core = await getCore()
    expect(core).toBeDefined()
  })

  it('getCoreSync returns null before loading', () => {
    _resetLoader()
    expect(getCoreSync()).toBeNull()
  })

  it('getCoreSync returns core after loading', async () => {
    await getCore()
    expect(getCoreSync()).not.toBeNull()
    expect(typeof getCoreSync()!.init).toBe('function')
  })

  it('manualUse registers modules when core is loaded', async () => {
    await getCore() // ensure core is loaded
    // Should not throw — registers module with core.use()
    const { CanvasRenderer } = await import('echarts/renderers')
    expect(() => manualUse(CanvasRenderer)).not.toThrow()
  })

  it('manualUse queues modules when core is not yet loaded', async () => {
    _resetLoader()
    // Core not loaded yet — should queue, not throw
    const { CanvasRenderer } = await import('echarts/renderers')
    expect(() => manualUse(CanvasRenderer)).not.toThrow()
  })

  it('loads radar component for radar config key', async () => {
    const core = await ensureModules({
      radar: { indicator: [{ name: 'A' }] },
      series: [{ type: 'radar', data: [{ value: [1] }] }],
    })
    expect(core).toBeDefined()
  })
})

// ─── Chart component ─────────────────────────────────────────────────────────

describe('Chart component', () => {
  it('renders a div element', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const unmount = mount(
      <Chart
        options={() => ({
          series: [{ type: 'bar', data: [1, 2, 3] }],
        })}
        style="height: 300px"
      />,
      container,
    )

    const div = container.querySelector('div')
    expect(div).not.toBeNull()

    unmount()
    container.remove()
  })

  it('applies style and class props to container', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const unmount = mount(
      <Chart
        options={() => ({
          series: [{ type: 'bar', data: [1] }],
        })}
        style="height: 400px; width: 100%"
        class="revenue-chart"
      />,
      container,
    )

    const div = container.querySelector('div')
    expect(div?.getAttribute('style')).toContain('height: 400px')
    expect(div?.getAttribute('class')).toContain('revenue-chart')

    unmount()
    container.remove()
  })
})

// ─── useChart basic API ──────────────────────────────────────────────────────

describe('useChart API', () => {
  // Import useChart lazily to avoid module-level echarts import issues
  it('returns the correct shape', async () => {
    const { useChart } = await import('../use-chart')

    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({
        series: [{ type: 'bar', data: [1, 2, 3] }],
      })),
    )

    expect(typeof chart.ref).toBe('function')
    expect(chart.instance()).toBeNull()
    expect(chart.loading()).toBe(true)
    expect(typeof chart.resize).toBe('function')

    unmount()
  })

  it('resize does not throw when no instance', async () => {
    const { useChart } = await import('../use-chart')

    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({
        series: [{ type: 'bar', data: [1] }],
      })),
    )

    expect(() => chart.resize()).not.toThrow()
    unmount()
  })

  it('loading starts as true', async () => {
    const { useChart } = await import('../use-chart')

    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({
        series: [{ type: 'pie', data: [{ value: 1 }] }],
      })),
    )

    expect(chart.loading()).toBe(true)
    unmount()
  })
})

// ─── All supported chart types ──────────────────────────────────────────────

describe('supported chart types', () => {
  const chartTypes = [
    'bar',
    'line',
    'pie',
    'scatter',
    'radar',
    'heatmap',
    'treemap',
    'sunburst',
    'sankey',
    'funnel',
    'gauge',
    'graph',
    'tree',
    'boxplot',
    'candlestick',
    'parallel',
    'themeRiver',
    'effectScatter',
    'lines',
    'pictorialBar',
    'custom',
    'map',
  ]

  for (const type of chartTypes) {
    it(`loads modules for type: ${type}`, async () => {
      _resetLoader()
      const core = await ensureModules({
        series: [{ type, data: [1] }],
      })
      expect(core).toBeDefined()
    })
  }
})

// ─── All supported component keys ───────────────────────────────────────────

describe('supported component keys', () => {
  const componentKeys = [
    'tooltip',
    'legend',
    'title',
    'toolbox',
    'dataZoom',
    'visualMap',
    'timeline',
    'graphic',
    'brush',
    'calendar',
    'dataset',
    'aria',
    'grid',
    'xAxis',
    'yAxis',
    'polar',
    'geo',
  ]

  for (const key of componentKeys) {
    it(`loads component for config key: ${key}`, async () => {
      _resetLoader()
      const core = await ensureModules({
        [key]: {},
        series: [{ type: 'bar', data: [1] }],
      })
      expect(core).toBeDefined()
    })
  }
})

// ─── Option validation ──────────────────────────────────────────────────────

describe('option validation', () => {
  it('handles empty options object', async () => {
    const core = await ensureModules({})
    expect(core).toBeDefined()
  })

  it('throws on null series entries', async () => {
    await expect(
      ensureModules({
        series: [null as any, { type: 'bar', data: [1] }],
      }),
    ).rejects.toThrow()
  })

  it('handles series with no type property', async () => {
    const core = await ensureModules({
      series: [{ data: [1, 2, 3] }],
    })
    expect(core).toBeDefined()
  })

  it('handles undefined series value', async () => {
    const core = await ensureModules({ series: undefined })
    expect(core).toBeDefined()
  })
})

// ─── Multiple chart instances ───────────────────────────────────────────────

describe('multiple chart instances', () => {
  it('creates independent useChart instances', async () => {
    const { useChart } = await import('../use-chart')

    const { result: chart1, unmount: unmount1 } = mountWith(() =>
      useChart(() => ({
        series: [{ type: 'bar', data: [1, 2, 3] }],
      })),
    )

    const { result: chart2, unmount: unmount2 } = mountWith(() =>
      useChart(() => ({
        series: [{ type: 'line', data: [4, 5, 6] }],
      })),
    )

    // Each instance has its own signals
    expect(chart1.instance).not.toBe(chart2.instance)
    expect(chart1.loading).not.toBe(chart2.loading)
    expect(chart1.error).not.toBe(chart2.error)

    unmount1()
    unmount2()
  })

  it('disposing one chart does not affect another', async () => {
    const { useChart } = await import('../use-chart')

    const { unmount: unmount1 } = mountWith(() =>
      useChart(() => ({
        series: [{ type: 'bar', data: [1] }],
      })),
    )

    const { result: chart2, unmount: unmount2 } = mountWith(() =>
      useChart(() => ({
        series: [{ type: 'bar', data: [2] }],
      })),
    )

    // Unmount first chart
    unmount1()

    // Second chart should still be functional
    expect(chart2.loading()).toBe(true)
    expect(chart2.error()).toBeNull()

    unmount2()
  })
})

// ─── Resize observer cleanup ────────────────────────────────────────────────

describe('resize observer cleanup', () => {
  it('chart instance is set to null on unmount', async () => {
    const { useChart } = await import('../use-chart')

    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({
        series: [{ type: 'bar', data: [1] }],
      })),
    )

    // Before unmount — instance is null (no container bound)
    expect(chart.instance()).toBeNull()

    unmount()

    // After unmount — instance remains null (was never created)
    expect(chart.instance()).toBeNull()
  })

  it('onUnmount disposes the chart instance when it exists', async () => {
    const { useChart } = await import('../use-chart')

    const el = document.createElement('div')
    document.body.appendChild(el)

    const mountEl = document.createElement('div')
    document.body.appendChild(mountEl)

    let chartResult: ReturnType<typeof useChart> | undefined
    const Child = () => {
      chartResult = useChart(() => ({
        series: [{ type: 'bar', data: [1] }],
      }))
      chartResult.ref(el)
      return null
    }
    const unmount = mount(<Child />, mountEl)

    // Wait for async module load + chart init
    await new Promise((r) => setTimeout(r, 300))

    // Whether init succeeded or not (happy-dom has no real dimensions),
    // unmount should not throw
    expect(() => unmount()).not.toThrow()

    // After unmount, instance should be null (cleaned up)
    expect(chartResult!.instance()).toBeNull()

    mountEl.remove()
    el.remove()
  })
})

// ─── Theme switching ────────────────────────────────────────────────────────

describe('theme config', () => {
  it('passes theme to useChart config', async () => {
    const { useChart } = await import('../use-chart')

    const { result: chart, unmount } = mountWith(() =>
      useChart(
        () => ({
          series: [{ type: 'bar', data: [1] }],
        }),
        { theme: 'dark' },
      ),
    )

    // Chart instance not yet created (no container), but API is valid
    expect(chart.instance()).toBeNull()
    expect(chart.error()).toBeNull()

    unmount()
  })

  it('Chart component accepts theme prop', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const unmount = mount(
      <Chart
        options={() => ({
          series: [{ type: 'bar', data: [1] }],
        })}
        theme="dark"
        style="height: 300px"
      />,
      container,
    )

    const div = container.querySelector('div')
    expect(div).not.toBeNull()

    unmount()
    container.remove()
  })
})

// ─── Error signal ───────────────────────────────────────────────────────────

describe('error signal', () => {
  it('error is null initially', async () => {
    const { useChart } = await import('../use-chart')

    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({
        series: [{ type: 'bar', data: [1] }],
      })),
    )

    expect(chart.error()).toBeNull()
    unmount()
  })

  it('error is set when optionsFn throws during init', async () => {
    const { useChart } = await import('../use-chart')

    const { result: chart, unmount } = mountWith(() =>
      useChart(() => {
        throw new Error('Bad options')
      }),
    )

    // Trigger init by setting a container
    const el = document.createElement('div')
    document.body.appendChild(el)
    chart.ref(el)

    await new Promise((r) => setTimeout(r, 100))

    expect(chart.error()).not.toBeNull()
    expect(chart.error()!.message).toBe('Bad options')
    expect(chart.loading()).toBe(false)

    unmount()
    el.remove()
  })

  it('error is set when optionsFn throws non-Error value during init', async () => {
    const { useChart } = await import('../use-chart')

    const { result: chart, unmount } = mountWith(() =>
      useChart(() => {
        throw 'string failure'
      }),
    )

    const el = document.createElement('div')
    document.body.appendChild(el)
    chart.ref(el)

    await new Promise((r) => setTimeout(r, 100))

    expect(chart.error()).not.toBeNull()
    expect(chart.error()!.message).toBe('string failure')

    unmount()
    el.remove()
  })

  it('useChart returns error signal in result shape', async () => {
    const { useChart } = await import('../use-chart')

    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({
        series: [{ type: 'bar', data: [1] }],
      })),
    )

    expect(typeof chart.error).toBe('function')
    expect(chart.error()).toBeNull()

    unmount()
  })
})

// ─── Chart component events ─────────────────────────────────────────────────

describe('Chart component events', () => {
  it('renders with event handler props without throwing', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const onClick = vi.fn()
    const onMouseover = vi.fn()

    const unmount = mount(
      <Chart
        options={() => ({
          series: [{ type: 'bar', data: [1] }],
        })}
        style="height: 300px"
        onClick={onClick}
        onMouseover={onMouseover}
      />,
      container,
    )

    expect(container.querySelector('div')).not.toBeNull()

    unmount()
    container.remove()
  })
})

// ─── Reactive options with signal ───────────────────────────────────────────

describe('reactive options', () => {
  it('useChart accepts optionsFn that reads signals', async () => {
    const { useChart } = await import('../use-chart')

    const data = signal([1, 2, 3])

    const { result: chart, unmount } = mountWith(() =>
      useChart(() => ({
        series: [{ type: 'bar', data: data() }],
      })),
    )

    expect(chart.loading()).toBe(true)
    expect(chart.error()).toBeNull()

    // Updating the signal should not throw
    data.set([4, 5, 6])

    unmount()
  })
})
