import { _resetLoader, ensureModules, getCore, getCoreSync } from '../loader'

afterEach(() => {
  _resetLoader()
})

// ─── Chart type detection ────────────────────────────────────────────────────

describe('chart type detection', () => {
  it('detects single chart type from series', { timeout: 15000 }, async () => {
    const core = await ensureModules({
      series: [{ type: 'bar', data: [1, 2, 3] }],
    })
    expect(core).toBeDefined()
    expect(typeof core.init).toBe('function')
  })

  it('detects multiple chart types from series array', { timeout: 15000 }, async () => {
    const core = await ensureModules({
      series: [
        { type: 'bar', data: [1] },
        { type: 'line', data: [2] },
        { type: 'pie', data: [{ value: 3 }] },
      ],
    })
    expect(core).toBeDefined()
  })

  it('detects all 22 chart types without error', { timeout: 15000 }, async () => {
    const types = [
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

    for (const type of types) {
      _resetLoader()
      const core = await ensureModules({ series: [{ type, data: [1] }] })
      expect(core).toBeDefined()
    }
  })

  it('handles series with unknown chart type gracefully', async () => {
    const core = await ensureModules({
      series: [{ type: 'doesNotExist', data: [1] }],
    })
    expect(core).toBeDefined()
  })

  it('handles series with no type property', async () => {
    const core = await ensureModules({
      series: [{ data: [1, 2, 3] }],
    })
    expect(core).toBeDefined()
  })

  it('handles series as a single object (not array)', async () => {
    const core = await ensureModules({
      series: { type: 'bar', data: [1, 2, 3] },
    })
    expect(core).toBeDefined()
  })
})

// ─── Component detection from config keys ───────────────────────────────────

describe('component detection from config keys', () => {
  const componentKeys = [
    'grid',
    'xAxis',
    'yAxis',
    'polar',
    'radar',
    'geo',
    'tooltip',
    'legend',
    'toolbox',
    'title',
    'dataZoom',
    'visualMap',
    'timeline',
    'graphic',
    'brush',
    'calendar',
    'dataset',
    'aria',
  ]

  for (const key of componentKeys) {
    it(`detects component for config key: ${key}`, async () => {
      _resetLoader()
      const core = await ensureModules({
        [key]: {},
        series: [{ type: 'bar', data: [1] }],
      })
      expect(core).toBeDefined()
    })
  }

  it('detects multiple components in one config', async () => {
    const core = await ensureModules({
      tooltip: { trigger: 'axis' },
      legend: {},
      title: { text: 'Chart' },
      xAxis: { type: 'category' },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: [1, 2] }],
    })
    expect(core).toBeDefined()
  })
})

// ─── Series feature detection (markPoint, markLine, markArea) ───────────────

describe('series feature detection', () => {
  it('detects markPoint in series', async () => {
    const core = await ensureModules({
      series: [
        {
          type: 'bar',
          data: [1, 2],
          markPoint: { data: [{ type: 'max' }] },
        },
      ],
    })
    expect(core).toBeDefined()
  })

  it('detects markLine in series', async () => {
    const core = await ensureModules({
      series: [
        {
          type: 'line',
          data: [1, 2],
          markLine: { data: [{ type: 'average' }] },
        },
      ],
    })
    expect(core).toBeDefined()
  })

  it('detects markArea in series', async () => {
    const core = await ensureModules({
      series: [
        {
          type: 'line',
          data: [1, 2],
          markArea: { data: [[{ xAxis: 'A' }, { xAxis: 'B' }]] },
        },
      ],
    })
    expect(core).toBeDefined()
  })

  it('detects all three features in a single series entry', async () => {
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
})

// ─── Renderer selection ─────────────────────────────────────────────────────

describe('renderer selection', () => {
  it('loads canvas renderer by default', async () => {
    const core = await ensureModules({
      series: [{ type: 'bar', data: [1] }],
    })
    expect(core).toBeDefined()
  })

  it('loads canvas renderer explicitly', async () => {
    const core = await ensureModules(
      { series: [{ type: 'bar', data: [1] }] },
      'canvas',
    )
    expect(core).toBeDefined()
  })

  it('loads SVG renderer when specified', async () => {
    const core = await ensureModules(
      { series: [{ type: 'bar', data: [1] }] },
      'svg',
    )
    expect(core).toBeDefined()
  })
})

// ─── Module caching ─────────────────────────────────────────────────────────

describe('module caching', () => {
  it('getCore returns the same instance on subsequent calls', async () => {
    const core1 = await getCore()
    const core2 = await getCore()
    expect(core1).toBe(core2)
  })

  it('getCoreSync returns null before any load', () => {
    _resetLoader()
    expect(getCoreSync()).toBeNull()
  })

  it('getCoreSync returns core after load', async () => {
    await getCore()
    const sync = getCoreSync()
    expect(sync).not.toBeNull()
    expect(typeof sync!.init).toBe('function')
  })

  it('second ensureModules call with same types is near-instant', async () => {
    await ensureModules({ series: [{ type: 'bar', data: [1] }] })

    const start = performance.now()
    await ensureModules({ series: [{ type: 'bar', data: [2] }] })
    const duration = performance.now() - start

    expect(duration).toBeLessThan(50)
  })

  it('_resetLoader clears cached state', async () => {
    await getCore()
    expect(getCoreSync()).not.toBeNull()

    _resetLoader()
    expect(getCoreSync()).toBeNull()

    // Still works after reset
    const core = await getCore()
    expect(core).toBeDefined()
  })
})

// ─── Option merging edge cases ──────────────────────────────────────────────

describe('option merging edge cases', () => {
  it('handles empty options object', async () => {
    const core = await ensureModules({})
    expect(core).toBeDefined()
  })

  it('handles options with no series key', async () => {
    const core = await ensureModules({ title: { text: 'Hello' } })
    expect(core).toBeDefined()
  })

  it('handles undefined series value', async () => {
    const core = await ensureModules({ series: undefined })
    expect(core).toBeDefined()
  })

  it('handles empty series array', async () => {
    const core = await ensureModules({ series: [] })
    expect(core).toBeDefined()
  })

  it('ignores non-component config keys', async () => {
    const core = await ensureModules({
      backgroundColor: '#fff',
      animation: true,
      series: [{ type: 'bar', data: [1] }],
    })
    expect(core).toBeDefined()
  })

  it('throws on null series entries', async () => {
    await expect(
      ensureModules({
        series: [null as any, { type: 'bar', data: [1] }],
      }),
    ).rejects.toThrow()
  })

  it('handles complex multi-type option object', async () => {
    const core = await ensureModules({
      title: { text: 'Dashboard' },
      tooltip: { trigger: 'axis' },
      legend: { data: ['Sales', 'Revenue'] },
      xAxis: { type: 'category', data: ['Jan', 'Feb'] },
      yAxis: { type: 'value' },
      grid: { left: '3%' },
      dataZoom: [{ type: 'slider' }],
      series: [
        { type: 'bar', data: [10, 20], markPoint: { data: [{ type: 'max' }] } },
        { type: 'line', data: [5, 15], markLine: { data: [{ type: 'average' }] } },
      ],
    })
    expect(core).toBeDefined()
  })
})
