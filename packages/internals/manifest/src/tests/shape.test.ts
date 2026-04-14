import { expectTypeOf } from 'vitest'
import type { ApiEntry, PackageManifest } from '../types'

describe('PackageManifest — type shape', () => {
  it('accepts a minimal valid manifest', () => {
    const m = {
      name: '@pyreon/x',
      tagline: 't',
      description: 'd',
      category: 'universal' as const,
      features: ['f'],
      api: [],
    } satisfies PackageManifest
    expectTypeOf(m).toExtend<PackageManifest>()
  })

  it('accepts an exhaustive manifest with every optional field', () => {
    const m = {
      name: '@pyreon/x',
      tagline: 't',
      description: 'd',
      category: 'browser' as const,
      peerDeps: ['@pyreon/runtime-dom'],
      features: ['f1', 'f2'],
      gotchas: ['g1'],
      since: '0.1.0',
      api: [
        {
          name: 'fn',
          kind: 'function' as const,
          signature: '() => void',
          summary: 's',
          example: 'e',
          mistakes: ['m1'],
          seeAlso: ['fn2'],
          stability: 'stable' as const,
          since: '0.1.0',
        },
      ],
    } satisfies PackageManifest
    expectTypeOf(m).toExtend<PackageManifest>()
  })

  it('accepts a deprecated ApiEntry with replacement + removeIn', () => {
    const entry = {
      name: 'oldFn',
      kind: 'function' as const,
      signature: '() => void',
      summary: 's',
      example: 'e',
      stability: 'deprecated' as const,
      deprecated: {
        since: '0.2.0',
        replacement: 'newFn',
        removeIn: '0.3.0',
      },
    } satisfies ApiEntry
    expectTypeOf(entry).toExtend<ApiEntry>()
  })

  it('rejects unknown category values at compile time', () => {
    const _bad = {
      name: 'x',
      tagline: 't',
      description: 'd',
      // @ts-expect-error — 'frontend' is not a valid category
      category: 'frontend',
      features: [],
      api: [],
    } satisfies PackageManifest
    void _bad
  })

  it('rejects unknown ApiEntry.kind values at compile time', () => {
    const _bad = {
      name: 'x',
      // @ts-expect-error — 'method' is not a valid kind
      kind: 'method',
      signature: '',
      summary: '',
      example: '',
    } satisfies ApiEntry
    void _bad
  })

  it('rejects unknown ApiEntry.stability values at compile time', () => {
    const _bad = {
      name: 'x',
      kind: 'function' as const,
      signature: '',
      summary: '',
      example: '',
      // @ts-expect-error — 'alpha' is not a valid stability
      stability: 'alpha',
    } satisfies ApiEntry
    void _bad
  })

  it('ApiEntry.stability is a closed union (stable | experimental | deprecated | undefined)', () => {
    // Declare as the full type so optional fields are in scope for type probes.
    const e: ApiEntry = {
      name: 'x',
      kind: 'function',
      signature: 's',
      summary: 'sm',
      example: 'e',
    }
    expectTypeOf(e.stability).toEqualTypeOf<'stable' | 'experimental' | 'deprecated' | undefined>()
  })

  it('PackageManifest.category is a closed union (browser | server | universal)', () => {
    const m: PackageManifest = {
      name: 'x',
      tagline: 't',
      description: 'd',
      category: 'universal',
      features: [],
      api: [],
    }
    expectTypeOf<typeof m.category>().toEqualTypeOf<'browser' | 'server' | 'universal'>()
  })
})
