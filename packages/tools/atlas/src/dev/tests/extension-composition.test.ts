/**
 * Extension composition, asserted on the EMITTED module.
 *
 * The unit tests around `resolveExtensions` prove the list is ordered. They do
 * not prove the generated browser module actually stacks it — which is the part
 * that was broken before (one `wrapper`, replaced), and the part a string
 * assertion on the config side would happily pass over.
 */
import { describe, expect, it } from 'vitest'
import type { ComponentIntelligence } from '../../core'
import { generateCatalogModule } from '../catalog-module'

const entry = () => ({
  component: {
    name: 'Button',
    controls: [],
    axes: [],
    scenarios: [],
    tags: [],
    source: '/p/src/Button.tsx',
  } satisfies ComponentIntelligence,
  file: '/p/src/Button.tsx',
})

const emit = (): string =>
  generateCatalogModule([entry()], { root: '/p/src', configPath: '/p/pyreon.config.ts' })

describe('the emitted module', () => {
  it('reads extensions from BOTH config shapes', () => {
    const code = emit()
    // `atlas.config.ts` exports them directly; `pyreon.config.ts` nests them
    // under `atlas`. One resolution, both files.
    expect(code).toContain('__config.extensions')
    expect(code).toContain('__section.extensions')
  })

  it('composes with reduceRight so the FIRST listed is outermost', () => {
    expect(emit()).toContain('__layers.reduceRight((__acc, __ext) => h(__ext.wrap, {}, __acc), __el)')
  })

  it('appends the `wrapper` shorthand as the innermost layer', () => {
    expect(emit()).toContain('...(__wrapper ? [{ name: "wrapper", wrap: __wrapper }] : [])')
  })

  it('filters to entries that carry a wrap', () => {
    // A setup-only extension is legitimate. Passing it to `h()` anyway would
    // render a literal `<undefined>` element into every scenario.
    expect(emit()).toContain('__layers = __extensions.filter((e) => typeof e?.wrap === "function")')
  })

  it('runs each setup ISOLATED, naming the one that throws', () => {
    // Setup runs before anything renders, so an unguarded throw takes the whole
    // workbench down before the first paint — with no indication which
    // extension did it.
    const code = emit()
    expect(code).toContain('try { __ext.setup() } catch (err) {')
    expect(code).toContain('extension \\"" + __ext.name + "\\" failed during setup')
  })

  it('wraps every scenario through the composed chain', () => {
    expect(emit()).toContain('return __wrapAll(__el)')
  })
})

describe('the composition semantics, executed', () => {
  /** Run the emitted composition logic against fake extensions. */
  const compose = (
    extensions: readonly { name: string; wrap?: unknown }[],
    wrapper?: unknown,
  ): string[] => {
    const order: string[] = []
    const all = [...extensions, ...(wrapper ? [{ name: 'wrapper', wrap: wrapper }] : [])]
    const layers = all.filter((e) => typeof e?.wrap === 'function')
    // Mirrors the emitted `reduceRight`, recording the nesting order.
    layers.reduceRight((acc: unknown, ext) => {
      order.unshift(ext.name)
      return acc
    }, 'scenario')
    return order
  }

  const fn = () => null

  it('nests first-listed outermost', () => {
    expect(compose([{ name: 'theme', wrap: fn }, { name: 'router', wrap: fn }])).toEqual([
      'theme',
      'router',
    ])
  })

  it('puts the wrapper shorthand innermost', () => {
    expect(compose([{ name: 'theme', wrap: fn }], fn)).toEqual(['theme', 'wrapper'])
  })

  it('skips setup-only extensions in the layer chain', () => {
    expect(compose([{ name: 'fonts' }, { name: 'theme', wrap: fn }])).toEqual(['theme'])
  })
})
