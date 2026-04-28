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

  it('preserves runtime mutability while narrowing literal types', () => {
    // The `<const M>` generic narrows string literals in the returned
    // type but does NOT readonly-freeze the object at runtime.
    // Consumers can still mutate (though they should not — the
    // generator treats manifests as immutable, and future readonly
    // enforcement may be added).
    const m = defineManifest({
      name: '@pyreon/x',
      tagline: 't',
      description: 'd',
      category: 'universal',
      features: [],
      api: [],
    })
    // Runtime mutation works (no Object.freeze applied).
    ;(m.features as string[]).push('added after define')
    expect(m.features).toEqual(['added after define'])
    // But the type-level narrowing on category is preserved.
    expectTypeOf(m.category).toEqualTypeOf<'universal'>()
  })

  // ── Deprecation policy validation ──────────────────────────────────────

  it('throws when stability: deprecated has no `deprecated` metadata', () => {
    expect(() =>
      defineManifest({
        name: '@pyreon/x',
        tagline: 't',
        description: 'd',
        category: 'universal',
        features: [],
        api: [
          {
            name: 'oldFn',
            kind: 'function',
            signature: '() => void',
            summary: 's',
            example: 'e',
            stability: 'deprecated',
          },
        ],
      }),
    ).toThrow(/no `deprecated` metadata/)
  })

  it('throws when deprecated entry has no `removeIn` planned removal', () => {
    expect(() =>
      defineManifest({
        name: '@pyreon/x',
        tagline: 't',
        description: 'd',
        category: 'universal',
        features: [],
        api: [
          {
            name: 'oldFn',
            kind: 'function',
            signature: '() => void',
            summary: 's',
            example: 'e',
            stability: 'deprecated',
            deprecated: { since: '0.10.0' },
          },
        ],
      }),
    ).toThrow(/no `deprecated\.removeIn`/)
  })

  it('accepts a fully-specified deprecated entry', () => {
    expect(() =>
      defineManifest({
        name: '@pyreon/x',
        tagline: 't',
        description: 'd',
        category: 'universal',
        features: [],
        api: [
          {
            name: 'oldFn',
            kind: 'function',
            signature: '() => void',
            summary: 's',
            example: 'e',
            stability: 'deprecated',
            deprecated: {
              since: '0.10.0',
              removeIn: '1.0.0',
              replacement: 'newFn',
            },
          },
        ],
      }),
    ).not.toThrow()
  })

  it('lets non-deprecated entries skip the metadata fields', () => {
    expect(() =>
      defineManifest({
        name: '@pyreon/x',
        tagline: 't',
        description: 'd',
        category: 'universal',
        features: [],
        api: [
          {
            name: 'fn',
            kind: 'function',
            signature: '() => void',
            summary: 's',
            example: 'e',
          },
          {
            name: 'expFn',
            kind: 'function',
            signature: '() => void',
            summary: 's',
            example: 'e',
            stability: 'experimental',
          },
        ],
      }),
    ).not.toThrow()
  })

  it('error message names the package + API for actionable reporting', () => {
    expect(() =>
      defineManifest({
        name: '@pyreon/widget',
        tagline: 't',
        description: 'd',
        category: 'browser',
        features: [],
        api: [
          {
            name: 'oldThing',
            kind: 'function',
            signature: '() => void',
            summary: 's',
            example: 'e',
            stability: 'deprecated',
          },
        ],
      }),
    ).toThrow(/'@pyreon\/widget'.*'oldThing'/)
  })
})
