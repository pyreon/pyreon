// Instance-owned registries: each createCompiler owns its services + element
// lowerings, and the parser/emitters read them through a SCOPED slot.
import { describe, expect, it } from 'vitest'
import { activeRegistries, defaultRegistries } from '../active-registries'
import {
  BUILT_IN_PLUGINS,
  createCompiler,
  parsePyreon,
  transform,
  type CompilerPlugin,
  type ElementLowering,
} from '../index'
import { testNativePlugin } from '../testing'
import { hooksPlugin } from './first-party-plugins'

const SERVICE_SPEC = {
  swift: 'AcmeGadget()',
  kotlin: ['val {id} = remember { AcmeGadget() }'],
}

const ACME_ELEMENT: ElementLowering = {
  module: '@acme/ui',
  tags: ['Banner'],
  emit: {
    swift: (el, ctx) => `AcmeBanner(id: ${ctx.stringLiteral(String(ctx.staticAttr(el, 'id')))})`,
    kotlin: (el, ctx) => `AcmeBanner(id = ${ctx.stringLiteral(String(ctx.staticAttr(el, 'id')))})`,
  },
}

const acme: CompilerPlugin = {
  name: '@acme/kit',
  apiVersion: 1,
  modules: ['@acme/kit'],
  services: { useGadget: SERVICE_SPEC },
  elements: [ACME_ELEMENT],
}

const SOURCE = `import { useGadget } from '@acme/kit'
import { Banner } from '@acme/ui'
export function App() {
  const gadget = useGadget()
  return (<Button onClick={() => gadget.go()}><Banner id="top" /></Button>)
}`

const out = (compiler: { transform: typeof transform }, target: 'swift' | 'kotlin') =>
  compiler.transform(SOURCE, { target })

describe('two compilers in one process never leak', () => {
  const withAcme = createCompiler({ plugins: [acme] })
  const plain = createCompiler()

  it('A, then B (without A), then A again — each output is its own', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const first = out(withAcme, target)
      expect(first.code).toContain('AcmeBanner(id')
      expect(first.code).toContain('AcmeGadget()')

      const other = out(plain, target)
      expect(other.code).not.toContain('AcmeBanner')
      expect(other.code).not.toContain('AcmeGadget')

      const again = out(withAcme, target)
      expect(again.code).toBe(first.code)
      expect(again.warnings).toEqual(first.warnings)
      // And the module-level default compiler never saw A's registrations.
      expect(transform(SOURCE, { target }).code).toBe(other.code)
    }
  })

  it('each instance owns distinct registries', () => {
    expect(withAcme.registries).not.toBe(plain.registries)
    expect(withAcme.services.has('useGadget')).toBe(true)
    expect(plain.services.has('useGadget')).toBe(false)
    expect(defaultRegistries().services.has('useGadget')).toBe(false)
    expect(withAcme.registries.elements.hasTag('Banner')).toBe(true)
    expect(plain.registries.elements.hasTag('Banner')).toBe(false)
  })

  it('parsePyreon takes registries explicitly; without them it uses the defaults', () => {
    const decls = (registries?: typeof withAcme.registries) =>
      parsePyreon(SOURCE, 'App.tsx', registries ? { registries } : {}).components.flatMap(
        (c) => c.decls,
      )
    expect(decls(withAcme.registries)).toContainEqual({ kind: 'service', name: 'gadget', hook: 'useGadget' })
    expect(decls().some((d) => d.kind === 'service')).toBe(false)
  })
})

describe('a third-party plugin lowers services AND elements end to end', () => {
  it.each(['swift', 'kotlin'] as const)('through testNativePlugin (%s)', (target) => {
    const result = testNativePlugin(acme, SOURCE, { target, requireNoWarnings: true })
    expect(result.code).toContain('AcmeGadget()')
    expect(result.code).toContain('AcmeBanner(id')
  })

  it('claims a plugin hook only from its declared modules (or @pyreon/*)', () => {
    const foreign = SOURCE.replace("from '@acme/kit'", "from './mine'")
    const result = testNativePlugin(acme, foreign, { target: 'swift' })
    expect(result.code).not.toContain('AcmeGadget()')
  })
})

describe('conflicts are load-time errors naming both owners', () => {
  const retag = (el: Parameters<NonNullable<ElementLowering['retag']>>[0]) => el

  it('a plugin service claiming a hook the hooks plugin owns', () => {
    expect(() =>
      createCompiler({ plugins: [hooksPlugin, { name: 'A', apiVersion: 1, services: { useShare: SERVICE_SPEC } }] }),
    ).toThrow(/hook "useShare" is claimed by both "@pyreon\/hooks" and "A"/)
  })

  it('a plugin element claiming another plugin\'s (module, tag)', () => {
    expect(() =>
      createCompiler({
        plugins: [
          { name: '@pyreon/coolgrid', apiVersion: 1, elements: [{ module: '@pyreon/coolgrid', tags: ['Row'], retag }] },
          { name: 'A', apiVersion: 1, elements: [{ module: '@pyreon/coolgrid', tags: ['Row'], retag }] },
        ],
      }),
    ).toThrow(/<Row> from @pyreon\/coolgrid is claimed by both "@pyreon\/coolgrid" and "A"/)
  })

  it('two plugins claiming one (module, tag)', () => {
    const el = (name: string): CompilerPlugin => ({
      name,
      apiVersion: 1,
      elements: [{ module: '@acme/ui', tags: ['Banner'], retag }],
    })
    expect(() => createCompiler({ plugins: [el('one'), el('two')] })).toThrow(
      /claimed by both "one" and "two"/,
    )
  })

  it('a discovered plugin replacing a builtIn plugin by name is NOT a conflict', () => {
    const replacement: CompilerPlugin = {
      name: '@pyreon/hooks',
      apiVersion: 1,
      elements: [{ module: '@pyreon/hooks', tags: ['Row', 'Col', 'Container'], retag }],
    }
    const compiler = createCompiler({ discovered: [replacement] })
    expect(compiler.registries.elements.entries.filter((e) => e.owner === '@pyreon/hooks')).toHaveLength(1)
    expect(compiler.registries.elements.entries.find((e) => e.owner === '@pyreon/hooks')?.lowering).toBe(
      replacement.elements![0],
    )
    const services = createCompiler({
      discovered: [{ name: '@pyreon/hooks', apiVersion: 1, services: { useShare: SERVICE_SPEC } }],
    })
    expect(services.services.get('useShare')?.descriptor.swift).toBe('AcmeGadget()')
    expect(services.services.has('useOnline')).toBe(false)
  })

  it('rejects a malformed element lowering at load time', () => {
    const bad = (elements: unknown) =>
      createCompiler({ plugins: [{ name: 'A', apiVersion: 1, elements } as unknown as CompilerPlugin] })
    expect(() => bad('x')).toThrow(/elements must be an array/)
    expect(() => bad([{ module: '', tags: ['A'], retag }])).toThrow(/needs a nonempty module/)
    expect(() => bad([{ module: 'm', tags: [] }])).toThrow(/nonempty tags/)
    expect(() => bad([{ module: 'm', tags: ['A'] }])).toThrow(/needs a retag or an emit/)
    expect(() => bad([{ module: 'm', tags: ['A'], retag: 1 }])).toThrow(/retag must be a function/)
  })

  it('built-in plugins are marked builtIn — and none ship: every library is discovered', () => {
    expect(BUILT_IN_PLUGINS.every((p) => p.builtIn === true)).toBe(true)
    expect(BUILT_IN_PLUGINS).toHaveLength(0)
  })
})

describe('the active slot is scoped: exception-safe and re-entrant', () => {
  const boom: CompilerPlugin = {
    name: 'boom',
    apiVersion: 1,
    services: { useGadget: SERVICE_SPEC },
    transformIR() {
      throw new Error('pass failed')
    },
  }

  it('a throwing pass leaves the slot restored', () => {
    const compiler = createCompiler({ plugins: [boom] })
    expect(() => compiler.transform(SOURCE, { target: 'swift' })).toThrow(/pass failed/)
    expect(activeRegistries()).toBe(defaultRegistries())
    expect(activeRegistries().services.has('useGadget')).toBe(false)
    // A following default compile is unaffected.
    expect(transform(SOURCE, { target: 'swift' }).code).not.toContain('AcmeGadget')
  })

  it('a throw during parse (bad source) leaves the slot restored', () => {
    const compiler = createCompiler({ plugins: [acme] })
    expect(() => compiler.transform('export function ({', { target: 'swift' })).toThrow()
    expect(activeRegistries()).toBe(defaultRegistries())
  })

  it('a nested transform on another compiler sees its own registries and restores the outer', () => {
    const inner = createCompiler()
    const seen: { during?: boolean; after?: boolean } = {}
    let outer: ReturnType<typeof createCompiler> | undefined
    outer = createCompiler({
      plugins: [
        acme,
        {
          name: 'nested',
          apiVersion: 1,
          transformIR() {
            const innerCode = inner.transform(SOURCE, { target: 'swift' }).code
            seen.during = !innerCode.includes('AcmeGadget')
            seen.after = activeRegistries() === outer!.registries
          },
        },
      ],
    })
    const result = outer.transform(SOURCE, { target: 'swift' })
    expect(seen).toEqual({ during: true, after: true })
    // The outer emit (after the nested call) still lowers with ITS registries.
    expect(result.code).toContain('AcmeGadget()')
    expect(result.code).toContain('AcmeBanner(id')
    expect(activeRegistries()).toBe(defaultRegistries())
  })
})
