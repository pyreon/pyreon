import { describe, expect, it } from 'vitest'
import { createCompiler } from '../compiler'
import { forEachExpr } from '../expr-walk'
import type { CompilerPlugin } from '../plugin'
import { assertPluginShape } from '../plugin-shape'
import { testNativePlugin } from '../testing'

// Two parse-side plugin extensions, exercised by a third-party toy plugin (no chart code involved):
//   - `runtimeTypes`  type names the plugin's RUNTIME declares, so a helper typed against one resolves
//   - `refineParse`   an IR edit that lands DURING parse, before helper return types are inferred

const TYPED = `import { Stack, Text } from '@pyreon/primitives'
function describe(c: ToyConfig): string { return c.name }
export function App(props: { cfg: ToyConfig }) { return (<Stack><Text>{describe(props.cfg)}</Text></Stack>) }
`

const FORMATTER = `import { Stack } from '@pyreon/primitives'
import { Gauge } from '@acme/toy'
function twice(v: number) { return v }
export function App() { return (<Stack><Gauge fmt={twice} /></Stack>) }
`

const unresolved = (warnings: readonly string[]) => warnings.filter((w) => w.includes("can't be resolved"))

/** Widen the parameter of every helper named by a `fmt` attribute to Double — the toy twin of the charts formatter refinement. */
const widenFmt: NonNullable<CompilerPlugin['refineParse']> = ({ components, helperFns }) => {
  for (const c of components) {
    forEachExpr(c.returnExpr, (n) => {
      if (n.kind !== 'jsx-element') return
      for (const a of n.attrs) {
        if (a.kind !== 'attr' || a.name !== 'fmt' || a.value.kind !== 'identifier') continue
        const fn = helperFns.find((h) => h.name === (a.value as { name: string }).name)
        const p = fn?.params[0]
        if (p !== undefined && p.type.kind === 'number') p.type = { kind: 'number', float: true }
      }
    })
  }
}

const toy = (over: Partial<CompilerPlugin> = {}): CompilerPlugin => ({
  name: '@acme/toy',
  apiVersion: 1,
  modules: ['@acme/toy'],
  ...over,
})

describe('CompilerPlugin.runtimeTypes', () => {
  it('a type the plugin declares resolves; without the plugin the same source warns', () => {
    const bare = createCompiler().transform(TYPED, { target: 'swift', filename: 'a.tsx' })
    expect(unresolved(bare.warnings)).toHaveLength(1)
    const withPlugin = testNativePlugin(toy({ runtimeTypes: ['ToyConfig'] }), TYPED, { target: 'swift', filename: 'a.tsx' })
    expect(unresolved(withPlugin.warnings)).toEqual([])
    expect(withPlugin.code).toContain('func describe(_ c: ToyConfig) -> String')
  })

  it('two plugins declaring one type is a load-time error naming both owners', () => {
    expect(() =>
      createCompiler({
        plugins: [toy({ name: '@acme/a', runtimeTypes: ['ToyConfig'] }), toy({ name: '@acme/b', runtimeTypes: ['ToyConfig'] })],
      }),
    ).toThrow(/runtime type "ToyConfig" is declared by both "@acme\/a" and "@acme\/b"/)
  })

  it('different plugins declaring different types do not conflict', () => {
    expect(() =>
      createCompiler({ plugins: [toy({ name: '@acme/a', runtimeTypes: ['A'] }), toy({ name: '@acme/b', runtimeTypes: ['B'] })] }),
    ).not.toThrow()
  })

  it('is instance-owned: compile with A, then a compiler without A, then A again', () => {
    const a = createCompiler({ plugins: [toy({ runtimeTypes: ['ToyConfig'] })] })
    const b = createCompiler()
    const run = (c: typeof a) => unresolved(c.transform(TYPED, { target: 'swift', filename: 'a.tsx' }).warnings).length
    expect(run(a)).toBe(0)
    expect(run(b)).toBe(1)
    expect(run(a)).toBe(0)
  })

  it('the built-in charts plugin still supplies the generated engine structs', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
import type { TooltipContent } from '@pyreon/charts/engine'
function tip(c: TooltipContent): string { return c.title }
export function App() { return (<Stack><Text>x</Text></Stack>) }
`
    expect(unresolved(createCompiler().transform(src, { target: 'swift', filename: 'a.tsx' }).warnings)).toEqual([])
  })

  it('shape validation rejects a non-array', () => {
    expect(() => assertPluginShape({ ...toy(), runtimeTypes: 'ToyConfig' })).toThrow(/runtimeTypes must be an array/)
  })
})

describe('CompilerPlugin.refineParse', () => {
  it('widens a helper parameter and the return is inferred over the widened parameter', () => {
    const bare = createCompiler().transform(FORMATTER, { target: 'swift', filename: 'a.tsx' })
    expect(bare.code).toContain('func twice(_ v: Int) -> Int')
    const refined = testNativePlugin(toy({ refineParse: widenFmt }), FORMATTER, { target: 'swift', filename: 'a.tsx' })
    expect(refined.code).toContain('func twice(_ v: Double) -> Double')
    const kotlin = testNativePlugin(toy({ refineParse: widenFmt }), FORMATTER, { target: 'kotlin', filename: 'a.tsx' })
    expect(kotlin.code).toContain('fun twice(v: Double): Double')
  })

  it('a transformIR pass is too late for this edit: the return was already inferred over Int', () => {
    // The reason `refineParse` exists — a post-parse pass can widen the parameter but not what was inferred from it.
    const late = toy({
      transformIR(module) {
        for (const h of module.helperFns) {
          const p = h.params[0]
          if (h.name === 'twice' && p !== undefined) p.type = { kind: 'number', float: true }
        }
      },
    })
    const out = testNativePlugin(late, FORMATTER, { target: 'swift', filename: 'a.tsx' })
    expect(out.code).toContain('func twice(_ v: Double) -> Int')
  })

  it('is instance-owned: compile with A, then without, then with A', () => {
    const a = createCompiler({ plugins: [toy({ refineParse: widenFmt })] })
    const b = createCompiler()
    const run = (c: typeof a) => c.transform(FORMATTER, { target: 'swift', filename: 'a.tsx' }).code
    expect(run(a)).toContain('-> Double')
    expect(run(b)).toContain('-> Int')
    expect(run(a)).toContain('-> Double')
  })

  it('shape validation rejects a non-function', () => {
    expect(() => assertPluginShape({ ...toy(), refineParse: {} })).toThrow(/refineParse must be a synchronous function/)
  })
})
