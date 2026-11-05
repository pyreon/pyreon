// The REFUSAL and resolution arms of `inline-hooks.ts`, driven through the pure `inlineCustomHooks` entry.
//
// The rewrite's contract is "inline faithfully or NAME why not": a shape it cannot reproduce must surface as a warning
// carrying the reason, never as a half-rewritten body or a call left in the emit with no diagnostic. The happy paths and
// a handful of refusals are locked end-to-end in `native-inline-custom-hooks.test.ts` / `native-inline-imported-hooks
// .test.ts`; this file covers the remaining refusal reasons one by one, plus the module-resolution outcomes, using an
// in-memory `readModule` so each case states its whole project inline.
//
// Every case asserts the OBSERVABLE: the exact reason in the warning, and that the call site is left as written (a
// refused hook is never partially substituted).

import { describe, expect, it } from 'vitest'
import { applyEdits, collectNestedBindings, inlineCustomHooks, lineEnd } from '../inline-hooks'

const ROOT = '/virtual/app'
const ENTRY = `${ROOT}/App.tsx`

/** An in-memory project: absolute path → source. The entry file is included so the caller "exists on disk". */
function inline(entry: string, files: Record<string, string> = {}) {
  const fs = new Map<string, string>([[ENTRY, entry]])
  for (const [rel, text] of Object.entries(files)) fs.set(`${ROOT}/${rel}`, text)
  return inlineCustomHooks(entry, ENTRY, { readModule: (p) => fs.get(p) })
}

const app = (hook: string, call: string) => `import { signal } from '@pyreon/reactivity'
${hook}
export function App(props: { start: number }) {
  ${call}
  return null
}
`

function warningOf(hook: string, call: string): string {
  const r = inline(app(hook, call))
  expect(r, 'expected the pass to report something').not.toBeNull()
  return r!.warnings.join('\n')
}

describe('a hook DEFINITION that cannot be inlined is named with its reason', () => {
  const cases: [string, string, string, string][] = [
    ['async', 'async function useA() { const v = signal(0); return v }', 'const x = useA()', 'it is async'],
    ['a generator', 'function* useG() { const v = signal(0); return v }', 'const x = useG()', 'it is a generator'],
    ['generic', 'function useT<T>(v: T) { const s = signal(v); return s }', 'const x = useT(1)', 'it is generic'],
    [
      'a destructured parameter',
      'function useD({ n }: { n: number }) { const s = signal(n); return s }',
      'const x = useD(props)',
      'a parameter is destructured, defaulted or a rest parameter',
    ],
    ['a defaulted parameter', 'function useD(n = 1) { const s = signal(n); return s }', 'const x = useD()', 'a parameter is destructured, defaulted or a rest parameter'],
    ['no return at all', 'function useN() { const s = signal(0) }', 'useN()', 'it does not end in a single `return <value>`'],
    ['a bare `return`', 'function useN() { const s = signal(0); return }', 'useN()', 'it does not end in a single `return <value>`'],
    ['a top-level for', 'function useF() { const s = signal(0); for (const i of [1]) s.set(i); return s }', 'const x = useF()', 'its body has a `for` at the top level'],
    ['a top-level while', 'function useW() { const s = signal(0); while (false) {} return s }', 'const x = useW()', 'its body has a `while` at the top level'],
    ['a top-level try', 'function useT() { const s = signal(0); try { s.set(1) } catch {} return s }', 'const x = useT()', 'its body has a `try` at the top level'],
    ['a top-level switch', 'function useS() { const s = signal(0); switch (1) {} return s }', 'const x = useS()', 'its body has a `switch` at the top level'],
    [
      'a nested function declaration',
      'function useFn() { const s = signal(0); function inner() {} return s }',
      'const x = useFn()',
      'its body has a `function declaration` at the top level',
    ],
    ['an unnamed statement kind', 'function useL() { const s = signal(0); lbl: s.set(1); return s }', 'const x = useL()', 'its body has a `LabeledStatement` at the top level'],
  ]
  for (const [what, hook, call, reason] of cases) {
    it(what, () => {
      const w = warningOf(hook, call)
      expect(w).toContain(`cannot be inlined into App for native: ${reason}`)
      expect(w).toContain('It stays a helper function')
    })
  }

  it('an early return inside a nested block (not at the top level) is still refused', () => {
    // `{ return v }` is a BlockStatement — refused as a top-level statement kind before the return scan runs, so the
    // `containsReturnOutsideNestedFunctions` scan is reached through an expression statement holding an IIFE body.
    const w = warningOf('function useE() { const v = signal(0); { return v } return v }', 'const x = useE()')
    expect(w).toContain('its body has a `BlockStatement` at the top level')
  })

  it('a `return` inside a nested ARROW is not an early return — the hook inlines', () => {
    const r = inline(app('function useOk() { const v = signal(0); const f = () => { return v() }; return v }', 'const x = useOk()'))
    expect(r!.warnings).toEqual([])
    expect(r!.code).toContain('const x = signal(0)')
    expect(r!.code).not.toContain('useOk')
  })
})

describe('a CALL SITE that cannot be rewritten is named with its reason, and left as written', () => {
  const HOOK = 'function useP(n: number) { const a = signal(n); const b = signal(1); return { a, b } }'
  const cases: [string, string, string, string][] = [
    ['a nested destructuring pattern', HOOK, 'const { a: { x } } = useP(1)', 'the call site destructures with a nested, computed or rest pattern'],
    ['a rest element', HOOK, 'const { a, ...rest } = useP(1)', 'the call site destructures with a nested, computed or rest pattern'],
    ['an array pattern', HOOK, 'const [a] = useP(1)', 'the call site destructures with a nested, computed or rest pattern'],
    ['too many arguments', HOOK, 'const { a } = useP(1, 2)', 'it is called with more arguments than it declares'],
    ['a spread argument', HOOK, 'const { a } = useP(...props.list)', 'argument 1 (`...props.list`) is an expression with a cost or a side effect'],
    ['a computed member argument', HOOK, 'const { a } = useP(props["start"])', 'argument 1 (`props["start"]`) is an expression with a cost or a side effect'],
    ['a template with a hole', HOOK, 'const { a } = useP(`${props.start}`)', 'argument 1 (``${props.start}``) is an expression with a cost or a side effect'],
    ['a key the hook does not return', HOOK, 'const { c } = useP(1)', 'the hook returns no `c`'],
    [
      'the same local destructured twice',
      'function useP(n: number) { const a = signal(n); return { a, b: a } }',
      'const { a, b } = useP(1)',
      '`a` is destructured twice',
    ],
    [
      'destructuring a non-object return',
      'function useV(n: number) { const a = signal(n); return a }',
      'const { a } = useV(1)',
      'the call site destructures the result, but the hook does not return an object literal',
    ],
    [
      'an object return whose entries are not its own locals',
      'function useO(n: number) { const a = signal(n); return { a, b: n } }',
      'const { a } = useO(1)',
      'the hook returns an object whose entries are not all its own locals',
    ],
    [
      'a parameter re-declared in the hook body',
      'function useR(n: number) { const n2 = signal(n); var n = 2; return n2 }',
      'const x = useR(1)',
      'the parameter `n` is re-declared in the hook body',
    ],
    [
      'a local shadowed by a catch parameter',
      'function useC(n: number) { const e = signal(n); const f = () => { try {} catch (e) {} }; return e }',
      'const x = useC(1)',
      '`e` is re-declared in a nested scope inside the hook',
    ],
  ]
  for (const [what, hook, call, reason] of cases) {
    it(what, () => {
      const r = inline(app(hook, call))!
      expect(r.warnings.join('\n')).toContain(`cannot be inlined into App for native: ${reason}`)
      // Refused, so the call is still there, untouched.
      expect(r.code).toContain(call)
    })
  }
})

describe('the rewrite itself', () => {
  it('a missing argument becomes `undefined`', () => {
    const r = inline(app('function useM(a: number, b?: number) { const s = signal(b ?? a); return s }', 'const x = useM(1)'))!
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('const x = signal(undefined ?? 1)')
  })

  it('a cast argument is parenthesised; a plain member read is not', () => {
    const r = inline(app('function useM(a: number) { const s = signal(a); return s }', 'const x = useM(props.start as number)'))!
    expect(r.code).toContain('const x = signal((props.start as number))')
    const r2 = inline(app('function useM(a: number) { const s = signal(a); return s }', 'const x = useM(props.start!)'))!
    expect(r2.code).toContain('const x = signal((props.start!))')
    const r3 = inline(app('function useM(a: number) { const s = signal(a); return s }', 'const x = useM(this.start)'))!
    expect(r3.code).toContain('const x = signal(this.start)')
  })

  it('an expression return is assigned to the caller name with the caller`s declaration kind', () => {
    const r = inline(app('function useSum(a: number) { const s = signal(a); return s() + 1 }', 'let total = useSum(props.start)'))!
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('const totalS = signal(props.start)')
    expect(r.code).toContain('let total = totalS() + 1')
  })

  it('an expression-statement call keeps the body and drops the value', () => {
    const r = inline(app('function useLog(a: number) { const s = signal(a); return s }', 'useLog(1)'))!
    expect(r.code).toContain('const logS = signal(1)')
    expect(r.code).not.toContain('useLog')
  })

  it('a renamed local that collides with a name in the file gets a numeric suffix', () => {
    const r = inline(app('function useM(a: number) { const s = signal(a); const t = s; return t }', 'const xS = 0\n  const x = useM(1)'))!
    expect(r.code).toContain('const xS2 = signal(1)')
    expect(r.code).toContain('const x = xS2')
  })

  it('a shorthand property in the body keeps its key when the local is renamed', () => {
    const r = inline(app('function useM(a: number) { const s = signal(a); const o = { s }; return o }', 'const x = useM(1)'))!
    expect(r.code).toContain('const x = { s: xS }')
  })

  it('an arrow-function hook with an expression body inlines as its implicit return', () => {
    const r = inline(app('const useTwice = (a: number) => a * 2', 'const two = useTwice(props.start)'))!
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('const two = props.start * 2')
    expect(r.code).not.toContain('useTwice')
  })

  it('a hook still referenced elsewhere keeps its declaration', () => {
    const r = inline(
      app('export function useK(a: number) { const s = signal(a); return s }', 'const x = useK(1)') + 'export { useK as again }\n',
    )!
    expect(r.code).toContain('export function useK')
  })

  it('a component declared as a const arrow is inlined into, under its own name', () => {
    const src = `import { signal } from '@pyreon/reactivity'
async function useA() { const v = signal(0); return v }
export const Panel = () => {
  const x = useA()
  return null
}
`
    const r = inline(src)!
    expect(r.warnings.join('\n')).toContain('useA() is a custom hook that cannot be inlined into Panel for native: it is async')
  })

  it('a source with no hook-shaped name and no relative import is skipped outright', () => {
    expect(inlineCustomHooks('export const x = 1\n', ENTRY)).toBeNull()
  })

  it('a source that does not parse is left alone', () => {
    expect(inlineCustomHooks('function useX( {', ENTRY)).toBeNull()
  })
})

describe('an imported hook: every resolution outcome is named', () => {
  const COUNTER = `import { signal } from '@pyreon/reactivity'
export function useCounter(start: number) {
  const count = signal(start)
  return count
}
`
  const APP = (imp: string) => `${imp}
export function App() {
  const c = useCounter(1)
  return null
}
`
  const warn = (imp: string, files: Record<string, string>): string => inline(APP(imp), files)!.warnings.join('\n')

  it('a hook-named export that is not a function', () => {
    expect(warn("import { useCounter } from './c'", { 'c.ts': 'export const useCounter = 1\n' })).toContain(
      "'./c' exports `useCounter`, which is not a hook it can inline",
    )
  })

  it('a default export that is not a function', () => {
    expect(warn("import useCounter from './c'", { 'c.ts': 'export default 1\n' })).toContain("'./c' default-exports something that is not a function")
  })

  it('a default export of a non-hook identifier', () => {
    expect(warn("import useCounter from './c'", { 'c.ts': 'const plain = () => 1\nexport default plain\n' })).toContain(
      "'./c' default-exports `plain`, which is not a hook it can inline",
    )
  })

  it('a default export of a non-hook named function', () => {
    expect(warn("import useCounter from './c'", { 'c.ts': 'export default function plain() { return 1 }\n' })).toContain(
      "'./c' default-exports `plain`, which is not a hook it can inline",
    )
  })

  it('a default export of a hook identifier resolves', () => {
    const r = inline(APP("import useCounter from './c'"), { 'c.ts': COUNTER.replace('export function', 'function') + 'export default useCounter\n' })!
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('const c = signal(1)')
  })

  it('an aliased export of a non-hook', () => {
    expect(warn("import { useCounter } from './c'", { 'c.ts': 'function plain() { return 1 }\nexport { plain as useCounter }\n' })).toContain(
      "'./c' exports `useCounter` as `plain`, which is not a hook it can inline",
    )
  })

  it('a re-export whose source module is missing', () => {
    expect(warn("import { useCounter } from './c'", { 'c.ts': "export { useCounter } from './gone'\n" })).toContain(
      "'./c' re-exports `useCounter` from './gone', which was not found",
    )
  })

  it('a module that does not parse', () => {
    expect(warn("import { useCounter } from './c'", { 'c.ts': 'export function useCounter( {' })).toContain("'./c' does not parse")
  })

  it('a module that exports no such hook (an `export *` of a missing module is skipped)', () => {
    expect(warn("import { useCounter } from './c'", { 'c.ts': "export * from './gone'\nexport const other = 1\n" })).toContain(
      "'./c' exports no hook named `useCounter`",
    )
  })

  it('a module hook that is itself refused carries its own reason', () => {
    expect(warn("import { useCounter } from './c'", { 'c.ts': 'export async function useCounter(n: number) { return n }\n' })).toContain(
      'useCounter() is a hook imported from another file that cannot be inlined into App for native: it is async',
    )
  })

  it('a module resolved through an index file', () => {
    const r = inline(APP("import { useCounter } from './hooks'"), { 'hooks/index.ts': COUNTER })!
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('const c = signal(1)')
  })

  it('another hook of the same module is imported for the next pass, and then inlined through', () => {
    const MOD = `import { signal } from '@pyreon/reactivity'
export function useInner(n: number) { const s = signal(n); return s }
export function useCounter(start: number) { const v = useInner(start); return v }
`
    const r = inline(APP("import { useCounter } from './c'"), { 'c.ts': MOD })!
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('signal(1)')
    expect(r.code).not.toMatch(/useInner\(|useCounter\(/)
  })

  it('a namespace and a default import the hook needs are carried with their own import form', () => {
    const MOD = `import * as R from '@pyreon/reactivity'
import fmt from 'some-fmt'
export function useCounter(start: number) { const v = R.signal(fmt(start)); return v }
`
    const r = inline(APP("import { useCounter } from './c'"), { 'c.ts': MOD })!
    expect(r.warnings).toEqual([])
    expect(r.code).toContain("import * as R from '@pyreon/reactivity'")
    expect(r.code).toContain("import fmt from 'some-fmt'")
  })

  it('an aliased import the hook needs keeps its alias', () => {
    const MOD = `import { signal as sig } from '@pyreon/reactivity'
export function useCounter(start: number) { const v = sig(start); return v }
`
    const r = inline(APP("import { useCounter } from './c'"), { 'c.ts': MOD })!
    expect(r.code).toContain("import { signal as sig } from '@pyreon/reactivity'")
  })

  it('a type the hook names is copied; a type it imports is carried, then copied in on the next pass', () => {
    const MOD = `import { signal } from '@pyreon/reactivity'
import { Remote } from './remote'
export interface Box { v: Remote }
export function useCounter(start: number) { const v = signal<Box | null>(null); return v }
`
    const r = inline(APP("import { useCounter } from './c'"), { 'c.ts': MOD, 'remote.ts': 'export type Remote = { id: string }\n' })!
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('interface Box { v: Remote }')
    expect(r.code).toContain('type Remote = { id: string }')
    expect(r.code).not.toContain("from './remote'")
  })

  it('two hooks that need the same name from different modules are refused for the second', () => {
    const A = `import { make } from 'lib-a'
export function useCounter(n: number) { const v = make(n); return v }
`
    const B = `import { make } from 'lib-b'
export function useOther(n: number) { const v = make(n); return v }
`
    const src = `import { useCounter } from './a'
import { useOther } from './b'
export function App() {
  const c = useCounter(1)
  const o = useOther(2)
  return null
}
`
    const r = inline(src, { 'a.ts': A, 'b.ts': B })!
    expect(r.warnings.join('\n')).toContain("useOther() cannot be inlined into App for native: it needs `make` from 'lib-b', which another inlined hook imports differently")
  })

  it('a type the hook names that the caller declares differently is refused', () => {
    const MOD = `import { signal } from '@pyreon/reactivity'
export type Box = { v: number }
export function useCounter(start: number) { const v = signal<Box | null>(null); return v }
`
    const src = `import { useCounter } from './c'
type Box = { other: string }
export function App() {
  const c = useCounter(1)
  return null
}
`
    const r = inline(src, { 'c.ts': MOD })!
    expect(r.warnings.join('\n')).toContain('it names the type `Box`, and this file already declares a different `Box`')
  })

  it('a type the hook names that the caller declares identically is not re-copied', () => {
    const MOD = `import { signal } from '@pyreon/reactivity'
export type Box = { v: number }
export function useCounter(start: number) { const v = signal<Box | null>(null); return v }
`
    const src = `import { useCounter } from './c'
type Box = { v: number }
export function App() {
  const c = useCounter(1)
  return null
}
`
    const r = inline(src, { 'c.ts': MOD })!
    expect(r.warnings).toEqual([])
    expect(r.code.match(/type Box/g)).toHaveLength(1)
  })

  it('an import the caller already has from the same place is reused, not duplicated', () => {
    const src = `import { signal } from '@pyreon/reactivity'
import { useCounter } from './c'
export function App() {
  const c = useCounter(1)
  return null
}
`
    const r = inline(src, { 'c.ts': COUNTER })!
    expect(r.warnings).toEqual([])
    expect(r.code.match(/import \{ signal \}/g)).toHaveLength(1)
  })
})

describe('imported types: copied in, or refused by name', () => {
  const src = (imp: string, extra = '') => `${imp}
${extra}
export function App(props: { m: Me }) { return null }
`
  it('an aliased type import is left alone', () => {
    const r = inline(src("import { Me as Mine } from './t'"), { 't.ts': 'export type Me = { n: string }\n' })
    expect(r).toBeNull()
  })

  it('a value import from a sibling is not treated as a type', () => {
    const r = inline(src("import { helper } from './t'"), { 't.ts': 'export const helper = 1\n' })
    expect(r).toBeNull()
  })

  it('a missing or unparseable sibling module is skipped', () => {
    expect(inline(src("import { Me } from './gone'"))).toBeNull()
    expect(inline(src("import { Me } from './t'"), { 't.ts': 'export type Me = {' })).toBeNull()
  })

  it('a same-named type declared differently here is refused by name', () => {
    const r = inline(src("import { Me } from './t'", 'type Inner = { other: 1 }'), {
      't.ts': 'export type Inner = { k: 1 }\nexport type Me = { i: Inner }\n',
    })!
    expect(r.warnings.join('\n')).toContain("The type `Me` imported from './t' cannot be copied in for native: `Inner` is already declared differently in this file")
  })

  it('an identical declaration already here is not copied twice', () => {
    const r = inline(src("import { Me } from './t'", 'type Inner = { k: 1 }'), {
      't.ts': 'export type Inner = { k: 1 }\nexport type Me = { i: Inner }\n',
    })!
    expect(r.warnings).toEqual([])
    expect(r.code.match(/type Inner/g)).toHaveLength(1)
    expect(r.code).toContain('type Me = { i: Inner }')
  })

  it('a caller compiled from memory copies nothing', () => {
    const s = src("import { Me } from './t'")
    expect(inlineCustomHooks(s, ENTRY, { readModule: () => undefined })).toBeNull()
  })
})

describe('AST helpers', () => {
  it('collectNestedBindings sees nested function names, for/if block declarations and catch params, not the test', () => {
    const body = [
      {
        type: 'IfStatement',
        test: { type: 'Identifier', name: 'cond' },
        consequent: {
          type: 'BlockStatement',
          body: [{ type: 'VariableDeclaration', declarations: [{ id: { type: 'ArrayPattern', elements: [null, { type: 'RestElement', argument: { type: 'Identifier', name: 'rest' } }] } }] }],
        },
      },
      {
        type: 'ExpressionStatement',
        expression: {
          type: 'FunctionExpression',
          id: { type: 'Identifier', name: 'named' },
          params: [{ type: 'AssignmentPattern', left: { type: 'Identifier', name: 'dflt' } }],
          body: { type: 'BlockStatement', body: [{ type: 'FunctionDeclaration', id: { type: 'Identifier', name: 'deep' }, params: [], body: { type: 'BlockStatement', body: [] } }] },
        },
      },
    ]
    const names = collectNestedBindings(body)
    expect([...names].sort()).toEqual(['deep', 'dflt', 'rest'])
  })

  it('applyEdits applies edits right-to-left and drops one that overlaps an already-applied edit', () => {
    expect(applyEdits('abcdef', [{ start: 1, end: 5, text: 'X' }, { start: 2, end: 3, text: 'Y' }])).toBe('abYdef')
    expect(applyEdits('abcdef', [{ start: 0, end: 1, text: 'A' }, { start: 4, end: 5, text: 'E' }])).toBe('AbcdEf')
  })

  it('lineEnd steps over a trailing newline only', () => {
    expect(lineEnd('a\nb', 1)).toBe(2)
    expect(lineEnd('ab', 1)).toBe(1)
  })
})
