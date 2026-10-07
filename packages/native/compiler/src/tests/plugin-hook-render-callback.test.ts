import { describe, expect, it } from 'vitest'
import { createCompiler, type CompilerPlugin } from '../index'

// A hook a PLUGIN recognizes extracts only at component-body scope, exactly like a built-in one: declared inside a
// `<For>` render callback it would be dropped, so the author is told to lift it. The warning's hook-name set used to
// be hand-written, so a hook that moved into a plugin lost the diagnostic silently.
const toy: CompilerPlugin = {
  name: '@acme/toy',
  apiVersion: 1,
  modules: ['@acme/toy'],
  calls: { useToy: () => ({ type: 'toy' }) },
  decls: { toy: { swift: (d, ctx) => `let ${ctx.ident(d.name)} = Toy()`, kotlin: (d, ctx) => `val ${ctx.ident(d.name)} = Toy()` } },
}

const SRC = `import { useToy } from '@acme/toy'
import { For, Stack, Text } from '@pyreon/primitives'
export function App(props: { xs: number[] }) {
  return (<Stack><For each={props.xs} by={(x) => x}>{(x) => { const t = useToy(); return <Text>{x}</Text> }}</For></Stack>)
}`

describe('plugin-recognized hooks declared inside a render callback', () => {
  it('are named and told to be lifted, like built-in hooks', () => {
    const warnings = createCompiler({ plugins: [toy] }).transform(SRC, { target: 'swift' }).warnings
    expect(warnings.some((w) => w.includes('Hook `useToy(…)` declared inside <For> render callback'))).toBe(true)
  })

  it('without the plugin the name is not a hook, so nothing is said', () => {
    expect(createCompiler().transform(SRC, { target: 'swift' }).warnings.some((w) => w.includes('render callback'))).toBe(false)
  })
})
