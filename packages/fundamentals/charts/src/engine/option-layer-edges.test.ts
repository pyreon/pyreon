// The dataset/encode layer is what the native compiler crosses through, so an
// unasserted arm here is a per-target divergence rather than a cosmetic gap.
// These drive the edges the happy-path suites next door do not reach: the
// shapes a registered transform can return, the dataset-reference failures,
// the `encode` lookups that miss, and the graphic-layer splice guards.
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendGraphicLayer,
  applyTransformsAll,
  registerChartTransform,
  resolveDataset,
  unregisterChartTransform,
} from './option-layer'
import type { DrawCmd } from './types'

const table = (dims: string[], rows: unknown[][]) => ({ dims, rows })

describe('applyTransformsAll — what a registered transform may hand back', () => {
  const registered: string[] = []
  const register = (type: string, transform: Parameters<typeof registerChartTransform>[0]['transform']) => {
    registerChartTransform({ type, transform })
    registered.push(type)
  }
  afterEach(() => {
    for (const t of registered.splice(0)) unregisterChartTransform(t)
  })

  it('an ARRAY-of-records result takes the object path and unions every record key', () => {
    // Keys are unioned in first-seen order, and a record missing a key gets
    // undefined for it rather than shifting the row.
    register('t:objects', () => ({ data: [{ a: 1, b: 2 }, { b: 3, c: 4 }] }))
    const [out] = applyTransformsAll(table(['x'], [[1]]), [{ type: 't:objects' }], [])
    expect(out!.dims).toEqual(['a', 'b', 'c'])
    expect(out!.rows).toEqual([[1, 2, undefined], [undefined, 3, 4]])
  })

  it('declared `dimensions` name the columns, as strings or as {name} objects', () => {
    register('t:named', () => ({ data: [[1, 2, 3]], dimensions: ['p', { name: 'q' }, { nope: true }] }))
    const [out] = applyTransformsAll(table(['x'], [[1]]), [{ type: 't:named' }], [])
    // A dimension entry that is neither a string nor {name: string} falls back
    // to its positional `dimN`.
    expect(out!.dims).toEqual(['p', 'q', 'dim2'])
  })

  it('without declared dimensions, a row width matching upstream REUSES the upstream names', () => {
    register('t:same-width', () => ({ data: [[9, 8]] }))
    const [out] = applyTransformsAll(table(['first', 'second'], [[1, 2]]), [{ type: 't:same-width' }], [])
    expect(out!.dims).toEqual(['first', 'second'])
  })

  it('a differing row width falls back to positional names', () => {
    register('t:wider', () => ({ data: [[9, 8, 7]] }))
    const [out] = applyTransformsAll(table(['first', 'second'], [[1, 2]]), [{ type: 't:wider' }], [])
    expect(out!.dims).toEqual(['dim0', 'dim1', 'dim2'])
  })

  it('a non-array `data` yields an empty table rather than throwing', () => {
    register('t:junk', () => ({ data: 'nope' } as never))
    const [out] = applyTransformsAll(table(['x'], [[1]]), [{ type: 't:junk' }], [])
    expect(out!.rows).toEqual([])
  })

  it('a transform returning SEVERAL results keeps every one of them', () => {
    register('t:split', () => [{ data: [[1]] }, { data: [[2]] }])
    const out = applyTransformsAll(table(['x'], [[0]]), [{ type: 't:split' }], [])
    expect(out).toHaveLength(2)
    expect(out[1]!.rows).toEqual([[2]])
  })

  it('a transform returning an EMPTY list keeps the upstream dims with no rows', () => {
    register('t:none', () => [])
    const [out] = applyTransformsAll(table(['x', 'y'], [[1, 2]]), [{ type: 't:none' }], [])
    expect(out!.dims).toEqual(['x', 'y'])
    expect(out!.rows).toEqual([])
  })

  it('a THROWING transform warns and passes the table through unchanged', () => {
    register('t:boom', () => {
      throw new Error('kaboom')
    })
    const warnings: Parameters<typeof applyTransformsAll>[2] = []
    const upstream = table(['x'], [[1]])
    const [out] = applyTransformsAll(upstream, [{ type: 't:boom' }], warnings)
    expect(out!.rows).toEqual([[1]])
    expect(warnings[0]!.message).toContain('kaboom')
  })

  it('a non-throwing failure that is not an Error still reports a message', () => {
    register('t:throw-string', () => {
      throw 'plain string'
    })
    const warnings: Parameters<typeof applyTransformsAll>[2] = []
    applyTransformsAll(table(['x'], [[1]]), [{ type: 't:throw-string' }], warnings)
    expect(warnings[0]!.message).toContain('plain string')
  })

  it('a non-object entry in the transform list is skipped without a warning', () => {
    const warnings: Parameters<typeof applyTransformsAll>[2] = []
    const upstream = table(['x'], [[1]])
    const [out] = applyTransformsAll(upstream, ['not-a-transform', 7, null], warnings)
    expect(out).toBe(upstream)
    expect(warnings).toEqual([])
  })

  it('a NON-STRING type cannot resolve a registration and warns as unregistered', () => {
    const warnings: Parameters<typeof applyTransformsAll>[2] = []
    applyTransformsAll(table(['x'], [[1]]), [{ type: 42 }], warnings)
    expect(warnings[0]!.code).toBe('option-key-unsupported')
  })
})

describe('resolveDataset — dataset references that cannot resolve', () => {
  it('an out-of-range fromTransformResult names that key and empties the dataset', () => {
    const { warnings } = resolveDataset({
      dataset: [
        { source: [['a', 'b'], [1, 2]] },
        { fromDatasetIndex: 0, fromTransformResult: 5, transform: { type: 'filter', config: { dimension: 'a', gte: 0 } } },
      ],
      series: [{ type: 'bar', datasetIndex: 1 }],
    })
    const w = warnings.find((x) => x.path.includes('fromTransformResult'))
    expect(w).toBeDefined()
    expect(w!.message).toContain('result 5 does not exist')
  })

  it('an unreadable fromDatasetId is reported by ID, not by index', () => {
    const { warnings } = resolveDataset({
      dataset: [{ id: 'src', source: 'not-a-source' }, { fromDatasetId: 'src', transform: { type: 'sort', config: { dimension: 0 } } }],
      series: [{ type: 'bar', datasetIndex: 1 }],
    })
    const w = warnings.find((x) => x.path.includes('fromDatasetId'))
    expect(w).toBeDefined()
    expect(w!.message).toContain('id "src"')
  })

  it('an unreadable fromDatasetIndex is reported by index', () => {
    const { warnings } = resolveDataset({
      dataset: [{ source: 'not-a-source' }, { fromDatasetIndex: 0, transform: { type: 'sort', config: { dimension: 0 } } }],
      series: [{ type: 'bar', datasetIndex: 1 }],
    })
    const w = warnings.find((x) => x.path.includes('fromDatasetIndex'))
    expect(w).toBeDefined()
    expect(w!.message).toContain('index 0')
  })
})

describe('resolveDataset — encode lookups that miss', () => {
  const base = { dataset: { source: [['k', 'v'], ['a', 1], ['b', 2]] } }

  it('an unknown encode.tooltip dimension warns and is skipped', () => {
    const { warnings } = resolveDataset({ ...base, series: [{ type: 'bar', encode: { x: 'k', y: 'v', tooltip: 'nope' } }] })
    expect(warnings.some((w) => w.path.endsWith('encode.tooltip'))).toBe(true)
  })

  it('an unknown encode.seriesName warns and the series keeps its default name', () => {
    const { option, warnings } = resolveDataset({ ...base, series: [{ type: 'bar', encode: { x: 'k', y: 'v', seriesName: 'nope' } }] })
    expect(warnings.some((w) => w.path.endsWith('encode.seriesName'))).toBe(true)
    expect((option['series'] as Record<string, unknown>[])[0]!['name']).toBeUndefined()
  })

  it('a KNOWN encode.seriesName renames the series, but an explicit name still wins', () => {
    const named = resolveDataset({ ...base, series: [{ type: 'bar', encode: { x: 'k', y: 'v', seriesName: 'k' } }] })
    expect((named.option['series'] as Record<string, unknown>[])[0]!['name']).toBe('k')

    const explicit = resolveDataset({ ...base, series: [{ type: 'bar', name: 'mine', encode: { x: 'k', y: 'v', seriesName: 'k' } }] })
    expect((explicit.option['series'] as Record<string, unknown>[])[0]!['name']).toBe('mine')
  })

  it('an unknown encode.itemName warns and the data stays bare values', () => {
    const { option, warnings } = resolveDataset({ ...base, series: [{ type: 'bar', encode: { x: 'k', y: 'v', itemName: 'nope' } }] })
    expect(warnings.some((w) => w.path.endsWith('encode.itemName'))).toBe(true)
    expect((option['series'] as Record<string, unknown>[])[0]!['data']).toEqual([1, 2])
  })

  it('a KNOWN encode.itemName produces {name, value} items', () => {
    const { option } = resolveDataset({ ...base, series: [{ type: 'bar', encode: { x: 'k', y: 'v', itemName: 'k' } }] })
    expect((option['series'] as Record<string, unknown>[])[0]!['data']).toEqual([
      { name: 'a', value: 1 },
      { name: 'b', value: 2 },
    ])
  })
})

describe('appendGraphicLayer — splice guards', () => {
  const cmds: DrawCmd[] = [{ kind: 'circle', center: { x: 1, y: 1 }, radius: 1, fill: '#000' }]

  it('returns the document untouched when there is nothing to draw', () => {
    const svg = '<svg width="10" height="10"></svg>'
    expect(appendGraphicLayer(svg, [], 10, 10)).toBe(svg)
  })

  it('returns the document untouched when it has no closing tag to splice before', () => {
    // A caller handed us something that is not a complete document — degrade
    // rather than emitting a layer into nowhere.
    expect(appendGraphicLayer('not an svg', cmds, 10, 10)).toBe('not an svg')
  })

  it('splices the layer contents immediately before the closing tag', () => {
    const out = appendGraphicLayer('<svg width="10" height="10"><rect/></svg>', cmds, 10, 10)
    expect(out.endsWith('</svg>')).toBe(true)
    expect(out).toContain('<rect/>')
    expect(out).toContain('<circle')
    // Exactly one document — the layer's own wrapper was unwrapped.
    expect(out.match(/<svg /g)).toHaveLength(1)
  })
})
