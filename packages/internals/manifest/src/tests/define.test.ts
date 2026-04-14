import { expectTypeOf } from 'vitest'
import { defineManifest } from '../define'
import type { PackageManifest } from '../types'

describe('defineManifest', () => {
  it('returns its argument by reference', () => {
    const input: PackageManifest = {
      name: '@pyreon/x',
      tagline: 't',
      description: 'd',
      category: 'universal',
      features: [],
      api: [],
    }
    const output = defineManifest(input)
    expect(output).toBe(input)
  })

  it('preserves literal-type narrowing on `category`', () => {
    const m = defineManifest({
      name: '@pyreon/x',
      tagline: 't',
      description: 'd',
      category: 'browser',
      features: [],
      api: [],
    })
    // `browser` stays literal — does not widen to `'browser' | 'server' | 'universal'`.
    expectTypeOf(m.category).toEqualTypeOf<'browser'>()
  })

  it('preserves literal narrowing on nested ApiEntry.kind', () => {
    const m = defineManifest({
      name: '@pyreon/x',
      tagline: 't',
      description: 'd',
      category: 'universal',
      features: [],
      api: [
        {
          name: 'useX',
          kind: 'hook',
          signature: '() => void',
          summary: 's',
          example: 'e',
        },
      ],
    })
    expectTypeOf(m.api[0]!.kind).toEqualTypeOf<'hook'>()
  })

  it('rejects invalid manifests at compile time', () => {
    // @ts-expect-error — missing required `features`
    defineManifest({
      name: '@pyreon/x',
      tagline: 't',
      description: 'd',
      category: 'universal',
      api: [],
    })
  })
})
