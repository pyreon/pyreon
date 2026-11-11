// A native module writes each spec number in the cross-target alias the native compiler reads as a native type:
// OpenAPI `integer` → `Int`, `number` → `Double`, both declared (`type Int = number`) only when used.
//
// A plain `number` field in a decoded type is an INTEGER natively, so a fractional value fails the whole decode — and
// the native compiler names every such field. A stream event has no response schema to settle it, so before this a
// generated stream module carried that warning for every number field (`Line.n`, `RoomEvent.at`), and a spec `number`
// field really did fail to decode `1.5`. The spec already says which it is; the generator now says it too.
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable, transform, validateKotlin, validateSwiftWithStubs } from './native-plugins'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'

const SPEC = JSON.stringify({
  openapi: '3.1.0',
  info: { title: 'Ticks', version: '1.0.0' },
  paths: {
    '/ticks': {
      get: {
        operationId: 'tailTicks',
        tags: ['ticks'],
        responses: { 200: { content: { 'application/x-ndjson': { itemSchema: { $ref: '#/components/schemas/Tick' } } } } },
      },
    },
  },
  components: {
    schemas: {
      Tick: {
        type: 'object',
        required: ['seq', 'price'],
        properties: { seq: { type: 'integer' }, price: { type: 'number' }, note: { type: 'string' } },
      },
    },
  },
})

const out = generate(SPEC, resolveConfig({ input: 'x', target: 'multiplatform' }))
const ticks = (): string => {
  const f = out.files.find((x) => x.path === 'ticks.native.tsx')
  if (!f) throw new Error(`no ticks.native.tsx; have ${out.files.map((x) => x.path).join(', ')}`)
  return f.contents
}

describe('native number fields are written as the spec types them', () => {
  it('integer → Int, number → Double, each alias declared once', () => {
    const src = ticks()
    expect(src).toMatch(/^type Int = number$/m)
    expect(src).toMatch(/^type Double = number$/m)
    expect(src).toMatch(/\bseq: Int\b/)
    expect(src).toMatch(/\bprice: Double\b/)
  })

  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: zero warnings, a 64-bit integer and a Double field, and it compiles`, () => {
      const r = transform(ticks(), { target })
      expect(r.warnings).toEqual([])
      expect(r.code).toContain(target === 'swift' ? 'var seq: Int' : 'var seq: Long')
      expect(r.code).toContain('var price: Double')
      if (target === 'swift' && isSwiftcAvailable()) {
        const v = validateSwiftWithStubs(r.code)
        expect(v.ok, v.ok ? '' : v.error).toBe(true)
      }
      if (target === 'kotlin' && isKotlincAvailable()) {
        const v = validateKotlin(r.code)
        expect(v.ok, v.ok ? '' : v.error).toBe(true)
      }
    }, 180_000)
  }
})
