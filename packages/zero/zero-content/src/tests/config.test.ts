/**
 * `defineConfig` / `defineCollection` / `defineComponents` /
 * `mergeComponents` — type-pass-through factories with dev-mode
 * validation.
 */
import { describe, expect, it } from 'vitest'
import type { ComponentFn } from '@pyreon/core'
import {
  defineCollection,
  defineComponents,
  defineConfig,
  mergeComponents,
} from '../config'

function StubComponent(_props: { x?: string }): null {
  return null
}

describe('defineConfig', () => {
  it('returns the config object unchanged', () => {
    const input = {
      collections: {
        docs: defineCollection({
          type: 'pages' as const,
          schema: { _kind: 'fake-schema' },
        }),
      },
    }
    const result = defineConfig(input)
    expect(result).toBe(input)
  })
})

describe('defineCollection', () => {
  it('returns the collection definition unchanged', () => {
    const input = {
      type: 'pages' as const,
      path: 'src/content/docs',
      schema: { _kind: 'fake-schema' },
    }
    const result = defineCollection(input)
    expect(result).toBe(input)
  })

  it('accepts collections without optional fields', () => {
    const result = defineCollection({
      type: 'data' as const,
      schema: {},
    })
    expect(result.type).toBe('data')
    expect(result.path).toBeUndefined()
  })
})

describe('defineComponents', () => {
  it('returns the input registry unchanged when all values are functions', () => {
    const input = { StubComponent } as Record<string, ComponentFn<{ x?: string }>>
    const result = defineComponents(input)
    expect(result).toBe(input)
    expect(result.StubComponent).toBe(StubComponent)
  })

  it('throws TypeError when a value is not a function (dev mode)', () => {
    // Simulates the `{ Playground: undefined }` typo class — a missing
    // import + a key in the registry.
    expect(() =>
      defineComponents({ Broken: undefined as unknown as ComponentFn<unknown> }),
    ).toThrow(TypeError)
    expect(() =>
      defineComponents({ Broken: undefined as unknown as ComponentFn<unknown> }),
    ).toThrow(/'Broken' is undefined/)
  })

  it('error message names the offending key for editor jump', () => {
    try {
      defineComponents({
        StubComponent,
        Broken: 42 as unknown as ComponentFn<unknown>,
      })
      expect.fail('should have thrown')
    } catch (err) {
      expect((err as Error).message).toContain("'Broken' is number")
    }
  })
})

describe('mergeComponents', () => {
  function A(_p: object): null {
    return null
  }
  function B(_p: object): null {
    return null
  }
  function BOverride(_p: object): null {
    return null
  }

  it('combines two registries', () => {
    const r = mergeComponents({ A }, { B })
    expect(r.A).toBe(A)
    expect(r.B).toBe(B)
  })

  it('later sources win on key collision', () => {
    const r = mergeComponents({ B }, { B: BOverride })
    expect(r.B).toBe(BOverride)
  })

  it('accepts an arbitrary number of sources', () => {
    const r = mergeComponents({ A }, { B }, { A: BOverride })
    expect(r.A).toBe(BOverride)
    expect(r.B).toBe(B)
  })

  it('returns an empty registry when called with no args', () => {
    expect(mergeComponents()).toEqual({})
  })
})
