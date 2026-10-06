import { describe, expect, it } from 'vitest'
import { createCompiler, type CompilerPlugin } from '../index'

// `tier2Calls` names calls a package ships no native lowering for. A declaration of one gets the standing Tier-2 diagnostic naming the
// plugin and emits nothing — and, unlike `calls`, it does not CLAIM the name, so another module's same-named function is not read as
// this package's. A toy package proves the seam names no library.
const toy = (tier2Calls: readonly string[] | undefined): CompilerPlugin => ({
  name: '@acme/widgets',
  apiVersion: 1,
  modules: ['@acme/widgets'],
  ...(tier2Calls === undefined ? {} : { tier2Calls }),
})

const SRC = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { makeWidget } from './mine'
export function App() {
  const own = makeWidget(1)
  const w = makeWidget(2)
  const n = signal(0)
  return <Stack><Text>{String(n())}</Text></Stack>
}`

const run = (plugin: CompilerPlugin) => createCompiler({ plugins: [plugin] }).transform(SRC, { target: 'swift' })

describe('tier2Calls', () => {
  it('reports the Tier-2 diagnostic for each declaration, naming the plugin and the binding, and declares nothing', () => {
    const r = run(toy(['makeWidget']))
    const hits = r.warnings.filter((w) => w.startsWith('makeWidget() declared (@acme/widgets, binding: `'))
    expect(hits).toHaveLength(2)
    expect(hits[0]).toContain('binding: `own`')
    expect(hits[1]).toContain('binding: `w`')
    expect(r.code).not.toMatch(/\bwidget\b|let own|let w\b/)
  })

  it('without the declaration the calls are not special', () => {
    expect(run(toy(undefined)).warnings.filter((w) => w.includes('Tier-2'))).toEqual([])
  })

  it('matches the callee as written: a same-named import from another module is still diagnosed, never renamed', () => {
    // A name CLAIM (`calls`) would make the hook-binding pass rename this import to `makeWidget_`.
    expect(run(toy(['makeWidget'])).code).not.toContain('makeWidget_')
  })

  it('REFUSES a malformed list by name', () => {
    expect(() => createCompiler({ plugins: [toy('makeWidget' as never)] })).toThrow('tier2Calls must be an array of callee names')
    expect(() => createCompiler({ plugins: [toy([''])] })).toThrow('tier2Calls must be an array of callee names')
  })
})
