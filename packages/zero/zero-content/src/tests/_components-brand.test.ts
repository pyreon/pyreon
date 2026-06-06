/**
 * PR-A audit C4 regression — `defineComponents` brand symbol is now
 * runtime-enforced. The manifest promised "the plugin can refuse raw
 * objects, catching `components: {Playground}` typos at build time with
 * a clear message" but pre-fix the brand existed in TYPES ONLY and no
 * runtime check ever fired.
 *
 * Locks the contract at three layers:
 *
 *   1. `defineComponents` attaches the brand symbol (non-enumerable,
 *      non-writable) AND validates each value is a function in BOTH
 *      dev AND production (`__DEV__` gating was a CI footgun).
 *
 *   2. `mergeComponents` preserves the brand on the merged result.
 *
 *   3. `validateConfigShape` (called from `loadConfig` on every
 *      Vite plugin startup) rejects raw `{...}` objects passed to a
 *      `components:` field — both per-collection and top-level — with
 *      an actionable error pointing at the fix.
 */
import { describe, expect, it } from 'vitest'
import {
  COMPONENTS_BRAND,
  defineCollection,
  defineComponents,
  isBrandedComponentsRegistry,
  mergeComponents,
} from '../index'
import { validateConfigShape } from '../config-loader'

const NoopComp = () => null
const Foo = NoopComp
const Bar = NoopComp

describe('PR-A C4 — defineComponents runtime brand', () => {
  it('stamps the brand symbol on the returned object', () => {
    const result = defineComponents({ Foo, Bar })
    expect(isBrandedComponentsRegistry(result)).toBe(true)
    expect((result as Record<symbol, unknown>)[COMPONENTS_BRAND]).toBe(true)
  })

  it('the brand is non-enumerable so it doesn\'t leak into Object.keys / spreads', () => {
    const result = defineComponents({ Foo, Bar })
    expect(Object.keys(result).sort()).toEqual(['Bar', 'Foo'])
    // Spreading copies enumerable OWN properties → no brand on the copy.
    const spread = { ...(result as Record<string, unknown>) }
    expect(isBrandedComponentsRegistry(spread as never)).toBe(false)
  })

  it('throws synchronously when a value is not a function (PR-A: validation no longer __DEV__-gated)', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      defineComponents({ Foo: undefined as any }),
    ).toThrow(/defineComponents.*undefined/)
  })

  it('isBrandedComponentsRegistry rejects raw object literals', () => {
    expect(isBrandedComponentsRegistry({ Foo, Bar })).toBe(false)
    expect(isBrandedComponentsRegistry(null)).toBe(false)
    expect(isBrandedComponentsRegistry(undefined)).toBe(false)
    expect(isBrandedComponentsRegistry('string' as never)).toBe(false)
  })

  it('mergeComponents preserves the brand on the merged result', () => {
    const a = defineComponents({ Foo })
    const b = defineComponents({ Bar })
    const merged = mergeComponents(a, b)
    expect(isBrandedComponentsRegistry(merged)).toBe(true)
    expect((merged as Record<string, unknown>).Foo).toBe(Foo)
    expect((merged as Record<string, unknown>).Bar).toBe(Bar)
  })
})

describe('PR-A C4 — config-loader rejects raw components literals', () => {
  it('throws when a per-collection `components` is a raw object', () => {
    const config = {
      collections: {
        docs: {
          ...defineCollection({
            type: 'pages',
            schema: { _check: 'something-truthy' } as unknown,
          }),
          // Raw `{...}` — bypasses the `defineComponents` brand stamp.
          components: { Foo, Bar },
        },
      },
    } as unknown
    expect(() =>
      validateConfigShape(config, '/abs/content.config.ts', '/abs'),
    ).toThrow(/collection "docs"\.components must be the result of `defineComponents/)
  })

  it('throws when the top-level `components:` is a raw object', () => {
    const config = {
      collections: {
        docs: defineCollection({
          type: 'pages',
          schema: { _check: 'something-truthy' } as unknown,
        }),
      },
      components: { Foo, Bar },
    } as unknown
    expect(() =>
      validateConfigShape(config, '/abs/content.config.ts', '/abs'),
    ).toThrow(/top-level `components:` must be the result/)
  })

  it('accepts a branded `defineComponents(...)` value at either level', () => {
    const config = {
      collections: {
        docs: {
          ...defineCollection({
            type: 'pages',
            schema: { _check: 'something-truthy' } as unknown,
          }),
          components: defineComponents({ Foo }),
        },
      },
      components: mergeComponents(defineComponents({ Bar })),
    } as unknown
    expect(() =>
      validateConfigShape(config, '/abs/content.config.ts', '/abs'),
    ).not.toThrow()
  })
})
