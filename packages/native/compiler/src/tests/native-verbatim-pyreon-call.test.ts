// A call to a Pyreon package function that NOTHING lowers is re-emitted verbatim, so the native build fails with
// "cannot find 'getSnapshot' in scope" and the compiler said nothing.
//
// Found by compiling every package's documented `api[].example` through the real compiler: inside a component, with
// its imports, 38 of 121 plain examples ended there (`getSnapshot`, `onPatch`, `formatError`, `isValid`, `createStorage`,
// `compose`, `withDuration`, …). The import-keyed warnings cover hooks, the web-only packages and modules with per-export
// advice; a PARTIAL package's other exports had nothing.
//
// The check reads the FINAL emitted text (not the emitter's call tail, which is also reached while computing output a
// plugin later discards) and needs the SOURCE to call the name too (a preset passed as a value is not a call).
import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import { verbatimPyreonCallWarnings, verbatimPyreonTypeWarnings } from '../verbatim-call-warning'

const app = (imports: string, body: string) => `${imports}
import { Stack, Text } from '@pyreon/primitives'
export function App() {
${body}
  return <Stack><Text>x</Text></Stack>
}`

describe('a Pyreon function call nothing lowered', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: warns, naming the function and its package`, () => {
      const r = transform(app(`import { getSnapshot } from '@pyreon/state-tree'`, `  const snap = getSnapshot(null as never)`), { target })
      const w = r.warnings.find((x) => x.startsWith('getSnapshot()'))
      expect(w, r.warnings.join('\n')).toBeDefined()
      expect(w).toMatch(/\(from @pyreon\/state-tree\) has NO native lowering/)
      expect(w).toMatch(/cannot find 'getSnapshot' in scope/)
    })
  }
  it('a renamed import warns under its ORIGINAL name', () => {
    const r = transform(app(`import { getSnapshot as snap } from '@pyreon/state-tree'`, `  const s = snap(null as never)`), { target: 'swift' })
    expect(r.warnings.join('\n')).toMatch(/getSnapshot\(\) \(from @pyreon\/state-tree\)/)
  })
  it('stays silent for a name the source only passes as a VALUE (a preset consumed by its package)', () => {
    const src = `import { kinetic } from '@pyreon/kinetic'
import { scaleIn } from '@pyreon/kinetic-presets'
import { Stack, Text } from '@pyreon/primitives'
const Box = kinetic('div').preset(scaleIn)
export function App() { return <Stack><Box><Text>x</Text></Box></Stack> }`
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(src, { target }).warnings.filter((w) => w.startsWith('scaleIn()'))).toEqual([])
    }
  })
  it('stays silent for a JSX tag import (the emitters lower it into a native composable of the same spelling)', () => {
    const src = `import { Container, Row, Col } from '@pyreon/coolgrid'
import { Text } from '@pyreon/primitives'
export function App() { return <Container><Row><Col size={6}><Text>x</Text></Col></Row></Container> }`
    expect(transform(src, { target: 'kotlin' }).warnings.filter((w) => w.startsWith('Row()'))).toEqual([])
  })
  it('stays silent when an earlier warning already names it (the plugin\'s own diagnostic is more specific)', () => {
    const imports = new Map([['getSnapshot', { source: '@pyreon/state-tree', imported: 'getSnapshot' }]])
    const code = 'let s = getSnapshot(x)'
    const src = 'const s = getSnapshot(x)'
    expect(verbatimPyreonCallWarnings(imports, src, code, [])).toHaveLength(1)
    expect(verbatimPyreonCallWarnings(imports, src, code, ['getSnapshot declaration dropped'])).toEqual([])
  })
  it('a name inside a string literal or a comment is not a call', () => {
    const imports = new Map([['getSnapshot', { source: '@pyreon/state-tree', imported: 'getSnapshot' }]])
    const src = 'const s = getSnapshot(x)'
    expect(verbatimPyreonCallWarnings(imports, src, 'let page = "<script>getSnapshot(1)</script>" // getSnapshot(2)', [])).toEqual([])
    expect(verbatimPyreonCallWarnings(imports, src, 'let m = obj.getSnapshot(1)', [])).toEqual([])
  })
})

// Two shapes the first version of the check missed, both found by re-running the documented-example sweep
// (`scripts/native-example-sweep.ts`): 31 examples failed to compile with no warning, and these were the real ones.
describe('shapes beyond a plain call', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: a call with type arguments (createRef<T>()) is still a call`, () => {
      const r = transform(
        app(`import { createRef } from '@pyreon/core'`, `  const inputRef = createRef<HTMLInputElement>()`),
        { target },
      )
      const w = r.warnings.find((x) => x.startsWith('createRef()'))
      expect(w, r.warnings.join('\n')).toBeDefined()
      expect(w).toMatch(/\(from @pyreon\/core\) has NO native lowering/)
    })

    it(`${target}: a bare value reference (isClient ? a : b) warns as a value, not a call`, () => {
      const r = transform(
        app(`import { isClient } from '@pyreon/reactivity'`, `  const initial = isClient ? 1 : 2`),
        { target },
      )
      const w = r.warnings.find((x) => x.startsWith('isClient (from'))
      expect(w, r.warnings.join('\n')).toBeDefined()
      expect(w).toMatch(/where no such value exists/)
    })
  }

  it('a local declaration with the same name is not a leftover import', () => {
    const imports = new Map([['isClient', { source: '@pyreon/reactivity', imported: 'isClient' }]])
    const src = 'const x = isClient ? 1 : 2'
    expect(verbatimPyreonCallWarnings(imports, src, 'let x = isClient ? 1 : 2', [])).toHaveLength(1)
    expect(verbatimPyreonCallWarnings(imports, src, 'let isClient = true\nlet x = isClient ? 1 : 2', [])).toEqual([])
  })

  it('an argument label and a member access are not references', () => {
    const imports = new Map([['isClient', { source: '@pyreon/reactivity', imported: 'isClient' }]])
    const src = 'const x = isClient ? 1 : 2'
    expect(verbatimPyreonCallWarnings(imports, src, 'Foo(isClient: true)\nobj.isClient', [])).toEqual([])
  })

  it('a name that only appears in the import statement is not a use', () => {
    const imports = new Map([['isClient', { source: '@pyreon/reactivity', imported: 'isClient' }]])
    const src = `import { isClient } from '@pyreon/reactivity'\nconst x = 1`
    expect(verbatimPyreonCallWarnings(imports, src, 'let y = isClient', [])).toEqual([])
  })
})

describe('a native parameter label that shares a spelling with a Pyreon export', () => {
  it('Kotlin named argument `model = …` (Coil AsyncImage) is not a leftover state-tree model import', () => {
    const imports = new Map([['model', { source: '@pyreon/state-tree', imported: 'model' }]])
    const src = 'const M = model({ a: 1 })'
    expect(verbatimPyreonCallWarnings(imports, src, 'AsyncImage(model = "x", contentDescription = "y")', [])).toEqual([])
    // A comparison is not a label: `model == x` is a use of the identifier.
    expect(verbatimPyreonCallWarnings(imports, 'if (model) {}', 'if (model == x) {}', [])).toHaveLength(1)
  })
})

// A Pyreon TYPE used as an annotation is copied through with the annotation and no Swift/Kotlin type of that name exists.
// Found by the example sweep: `(s: TransitionStage) => …` and `(t: TransitionStateResult): string`.
describe('a Pyreon type that survives into the output undeclared', () => {
  const typeApp = (imports: string, top: string) => `${imports}
import { Stack, Text } from '@pyreon/primitives'
${top}
export function App() { return <Stack><Text>x</Text></Stack> }`

  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: warns, naming the type and its package`, () => {
      const r = transform(
        typeApp(
          `import type { TransitionStage } from '@pyreon/kinetic'`,
          `const isAnimating = (s: TransitionStage) => s === 'entering' || s === 'leaving'`,
        ),
        { target },
      )
      const w = r.warnings.find((x) => x.startsWith('type TransitionStage'))
      expect(w, r.warnings.join('\n')).toBeDefined()
      expect(w).toMatch(/\(from @pyreon\/kinetic\) has no native counterpart/)
      expect(w).toMatch(/cannot find type 'TransitionStage' in scope/)
    })
  }

  it('the per-specifier `import { type X }` form counts too', () => {
    const r = transform(
      typeApp(
        `import { type TransitionStage } from '@pyreon/kinetic'`,
        `const isAnimating = (s: TransitionStage) => s === 'entering'`,
      ),
      { target: 'swift' },
    )
    expect(r.warnings.some((x) => x.startsWith('type TransitionStage'))).toBe(true)
  })

  it('a type the emitted file declares itself is not a leftover', () => {
    const types = new Map([['Mode', { source: '@pyreon/x', imported: 'Mode' }]])
    expect(verbatimPyreonTypeWarnings(types, 'let m: Mode = .a', new Map(), [])).toHaveLength(1)
    expect(verbatimPyreonTypeWarnings(types, 'enum Mode { case a }\nlet m: Mode = .a', new Map(), [])).toEqual([])
    expect(verbatimPyreonTypeWarnings(types, 'struct Mode {}\nlet m: Mode', new Map(), [])).toEqual([])
  })

  it('a type a plugin runtime provides (runtimeTypes) is not flagged', () => {
    const types = new Map([['ChartHandle', { source: '@pyreon/charts', imported: 'ChartHandle' }]])
    expect(verbatimPyreonTypeWarnings(types, 'let h: ChartHandle', new Map([['ChartHandle', 'PyreonChartHandle']]), [])).toEqual([])
  })

  it('an unused type import, or one an earlier warning already names, stays silent', () => {
    const types = new Map([['Mode', { source: '@pyreon/x', imported: 'Mode' }]])
    expect(verbatimPyreonTypeWarnings(types, 'let m = 1', new Map(), [])).toEqual([])
    expect(verbatimPyreonTypeWarnings(types, 'let m: Mode', new Map(), ['Mode could not be resolved'])).toEqual([])
    expect(verbatimPyreonTypeWarnings(undefined, 'let m: Mode', new Map(), [])).toEqual([])
  })

  it('a plain value import of a capitalised name is NOT treated as a type', () => {
    const r = transform(
      typeApp(`import { Fragment } from '@pyreon/core'`, `const x = 1`),
      { target: 'swift' },
    )
    expect(r.warnings.filter((x) => x.startsWith('type '))).toEqual([])
  })
})

describe('names are matched literally', () => {
  it('a `$` inside an identifier is not a regex anchor', () => {
    const imports = new Map([['a$b', { source: '@pyreon/x', imported: 'a$b' }]])
    expect(verbatimPyreonCallWarnings(imports, 'a$b()', 'let r = a$b()', [])).toHaveLength(1)
    // `$` as an anchor would let `ab` (no dollar) match; literal matching must not.
    expect(verbatimPyreonCallWarnings(imports, 'ab()', 'let r = ab()', [])).toEqual([])
  })
})
