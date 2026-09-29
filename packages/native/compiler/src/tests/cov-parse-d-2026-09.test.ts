// Branch coverage — `src/parse.ts` outside the 8500–10500 band: TS utility-type
// lowering (`lowerUtilityType` / `resolveObjectShape` / `stripNullish`), the
// rarer `parseTypeAnnotation` arms (qualified names, nested unions, numeric /
// boolean literal types, un-annotated function-type params), helper-body
// statement lowering (`parseStatement` / `classifyForRange` bail arms,
// labeled statements, switch label grouping), and the imperative
// `@pyreon/toast` / `@pyreon/a11y` call recognizers.
//
// Each spec pairs the shape that takes a branch with the neighbour that must
// not, and asserts the EMITTED Swift / Kotlin text or the named warning.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })

const PRIM = `import { Text, Press, Stack } from '@pyreon/primitives'\n`
/** A helper `f` whose parameter list is the thing under test, rendered once. */
const fnWithParams = (params: string, pre = '') =>
  `${PRIM}${pre}\nfunction f(${params}) { return 1 }\nexport function App(){ return <Text>{String(f)}</Text> }`
/** The emitted helper signature line. */
const sigLine = (code: string): string =>
  code.split('\n').find((l) => /\bfunc f\(|\bfun f\(/.test(l)) ?? ''

describe('parse.ts — lowerUtilityType: lowered forms', () => {
  it('Required<{…}> strips optional wrappers; Required<Unresolved> erases to the base', () => {
    const k = kotlin(fnWithParams('x: Required<Foo>, y: Required<Th>', 'type Th = { a?: number; b: string | null }'))
    expect(sigLine(k.code)).toContain('x: Foo')
    // The visible field set is re-synthesized with the optionals stripped.
    expect(sigLine(k.code)).not.toContain('y: Any')
    expect(k.warnings.join('\n')).not.toContain('Required<')
  })

  it('NonNullable strips the nullish branch; a single survivor collapses', () => {
    const r = swift(fnWithParams('y: NonNullable<string | null>'))
    expect(sigLine(r.code)).toContain('_ y: String')
  })

  it('NonNullable of an all-nullish union degrades to Any', () => {
    const r = swift(fnWithParams('o: NonNullable<null | undefined>'))
    expect(sigLine(r.code)).toContain('_ o: Any')
  })

  it('NonNullable of a multi-branch union keeps a union (a mixed union degrades to Any)', () => {
    const r = swift(fnWithParams('n: NonNullable<string | number | null>'))
    expect(sigLine(r.code)).toContain('_ n: Any')
  })

  it('NonNullable over a union nested in a union flattens into the outer union', () => {
    const r = swift(fnWithParams('y: string | NonNullable<number | boolean | null>'))
    expect(sigLine(r.code)).toContain('_ y: Any')
    expect(r.warnings.join('\n')).not.toContain('NonNullable')
  })

  it('Awaited<Promise<T>> is T and Awaited<T> on a non-thenable is T', () => {
    const r = swift(fnWithParams('z: Awaited<Promise<number>>, w: Awaited<boolean>'))
    expect(sigLine(r.code)).toContain('_ z: Int, _ w: Bool')
  })

  it('the four string-case utilities are all `string`', () => {
    const r = swift(
      fnWithParams("a: Uppercase<'a'>, b: Lowercase<'A'>, c: Capitalize<'a'>, d: Uncapitalize<'A'>"),
    )
    expect(sigLine(r.code)).toContain('_ a: String, _ b: String, _ c: String, _ d: String')
  })

  it('NoInfer erases to its argument and Record lowers to a dictionary', () => {
    const s = swift(fnWithParams('o: NoInfer<number>, n: Record<string, number>'))
    expect(sigLine(s.code)).toContain('_ o: Int, _ n: [String: Int]')
    const k = kotlin(fnWithParams('n: Record<string, number>'))
    expect(sigLine(k.code)).toContain('n: MutableMap<String, Int>')
  })
})

describe('parse.ts — lowerUtilityType: declined forms and arity errors', () => {
  const warn = (src: string) => swift(src).warnings.join('\n')

  it.each([
    ['Record', 'r: Record<string>', 'it takes a key type and a value type.'],
    ['Readonly', 'q: Readonly<number, string>', 'it takes exactly one type argument.'],
    ['Required', 'i: Required<number, string>', 'it takes exactly one type argument.'],
    ['NonNullable', 'h: NonNullable<number, string>', 'it takes exactly one type argument.'],
    ['Awaited', 'j: Awaited<number, string>', 'it takes exactly one type argument.'],
  ])('%s with the wrong arity is declined by name', (name, params, why) => {
    const w = warn(fnWithParams(params))
    expect(w).toContain(`\`${name}<…>\` has no native form in PMTC — ${why}`)
  })

  it('Exclude / Extract decline as union filtering', () => {
    const w = warn(fnWithParams("k: Exclude<'a' | 'b', 'a'>, p: Extract<'a', 'a'>"))
    expect(w).toContain('`Exclude<…>` has no native form')
    expect(w).toContain('`Extract<…>` has no native form')
    expect(w).toContain('filtering a union needs a type-level evaluator')
  })

  it('a declined utility warns ONCE however many sites use it', () => {
    const w = swift(fnWithParams("a: Exclude<'a', 'b'>, b: Exclude<'a', 'b'>")).warnings
    expect(w.filter((x) => x.includes('`Exclude<…>`'))).toHaveLength(1)
  })
})

describe('parse.ts — parseTypeAnnotation: rare arms', () => {
  it('a qualified type name `Foo.Bar` is kept verbatim', () => {
    const r = swift(fnWithParams('x: Foo.Bar'))
    expect(sigLine(r.code)).toContain('_ x: Foo.Bar')
  })

  it('numeric and boolean literal types degrade to their base type', () => {
    const r = swift(fnWithParams('z: 1 | 2, w: true'))
    expect(sigLine(r.code)).toContain('_ z: Int, _ w: Bool')
  })

  it('a negative numeric literal type (a unary expression) degrades to Any', () => {
    const r = swift(fnWithParams('v: -1'))
    expect(sigLine(r.code)).toContain('_ v: Any')
  })

  it('function-type params: an un-annotated param is Any, a destructured one keeps its type', () => {
    const k = kotlin(fnWithParams('u: (a, { b }: { b: number }) => void'))
    expect(sigLine(k.code)).toMatch(/u: \(Any, \w+\) -> Unit/)
  })
})

describe('parse.ts — parseStatement: helper-body loops', () => {
  const body = (stmts: string) =>
    `${PRIM}function g(xs: number[]): number {\n let a = 0\n ${stmts}\n return a\n}\nexport function App(){ return <Text>{g([1])}</Text> }`
  const RANGE_WARN = 'Only the canonical count-loop lowers to native'

  it.each([
    ['no test', 'for (let i = 0; ; i++) { a += i }'],
    ['no init/test/update', 'for (;;) { break }'],
    ['init is an assignment, not a declaration', 'let i = 0\n for (i = 0; i < 3; i++) { a += 1 }'],
    ['two declarators', 'for (let i = 0, j = 1; i < 3; i++) { a += 1 }'],
    ['destructured counter', 'for (let [i] = [0]; i < 3; i++) { a += 1 }'],
    ['counter without an initializer', 'for (let i; i < 3; i++) { a += 1 }'],
  ])('a non-canonical for (%s) warns and drops', (_label, loop) => {
    const r = swift(body(loop))
    expect(r.warnings.join('\n')).toContain(RANGE_WARN)
    expect(r.code).not.toContain('for i in')
  })

  it('the canonical count loop is the positive control', () => {
    const r = swift(body('for (let i = 0; i < 3; i++) { a += i }'))
    expect(r.code).toContain('for i in 0..<3')
    expect(r.warnings.join('\n')).not.toContain(RANGE_WARN)
  })

  it('for-of with a destructured or bare-identifier binding warns', () => {
    const w1 = swift(body('for (const { q } of xs) { a += 1 }')).warnings.join('\n')
    expect(w1).toContain('Unsupported for-of binding')
    const w2 = swift(body('let x = 0\n for (x of xs) { a += 1 }')).warnings.join('\n')
    expect(w2).toContain('Unsupported for-of binding')
  })

  it('a labeled loop keeps its label on both targets; a labeled block warns', () => {
    const src = body('outer: for (const x of xs) { if (x > 1) continue outer; a += x }')
    expect(swift(src).code).toContain('outer: for x in xs')
    expect(kotlin(src).code).toContain('outer@ for')
    const w = swift(body('lbl: { a = 1 }')).warnings.join('\n')
    expect(w).toContain('A labeled statement is only supported on a LOOP')
  })

  it('an un-braced if/else lowers both single-statement branches', () => {
    const r = swift(body('if (a > 1) a = 2; else a = 3'))
    expect(r.code).toMatch(/if a > 1 \{\n\s+a = 2\n\s+\} else \{\n\s+a = 3/)
  })

  it('switch groups empty case labels and strips the trailing break', () => {
    const r = swift(body('switch (a) { case 1: case 2: a = 5; break; default: a = 0 }'))
    expect(r.code).toContain('case 1, 2:')
    expect(r.code).toContain('default:')
    expect(r.code).not.toContain('break')
  })
})

describe('parse.ts — imperative @pyreon/toast and @pyreon/a11y calls', () => {
  const handler = (imports: string, stmts: string) =>
    `${PRIM}${imports}\nexport function App(){ return <Press onPress={() => { ${stmts} }}><Text>x</Text></Press> }`
  const TOAST = "import { toast } from '@pyreon/toast'"
  const A11Y = "import { announce } from '@pyreon/a11y'"

  it('toast.loading maps to info and a literal duration (ms) sets the dismiss seconds', () => {
    const r = swift(handler(TOAST, 'toast.loading("L", { duration: 500 })'))
    expect(r.code).toContain('PyreonToast.shared.add("L", type: "info", duration: 0.5)')
  })

  it('a no-arg preset call emits an empty message', () => {
    const r = swift(handler(TOAST, 'toast.success()'))
    expect(r.code).toContain('PyreonToast.shared.add("", type: "success")')
  })

  it('computed / string-keyed / spread / non-numeric duration options are ignored', () => {
    const r = swift(
      handler(TOAST, `const k = "duration"; const o = {}; toast("m", { [k]: 5, ...o, 'x': 1, duration: "5" })`),
    )
    expect(r.code).toContain('PyreonToast.shared.add("m", type: "info")')
    expect(r.code).not.toContain('duration:')
  })

  it('a member call on the toast binding that is not a preset is not a toast call', () => {
    const r = swift(handler(TOAST, 'toast.dismiss("q")'))
    expect(r.code).not.toContain('PyreonToast.shared.add("q"')
  })

  it('announce() with no args, a polite option, a computed key, and a string-keyed assertive', () => {
    const r = swift(
      handler(A11Y, `announce(); announce("a", { politeness: "polite", ['k']: 1 }); announce("b", { 'politeness': 'assertive' })`),
    )
    expect(r.code).toContain('PyreonA11y.announce("", assertive: false)')
    expect(r.code).toContain('PyreonA11y.announce("a", assertive: false)')
    expect(r.code).toContain('PyreonA11y.announce("b", assertive: true)')
  })
})

describe('known bug — Swift inline-object helper params', () => {
  // Regression (fixed in native-known-bugs-emit): a helper whose parameter is
  // an INLINE object type emitted a TUPLE on Swift (`_ u: (a: Int, b: String)`,
  // and a single-field one collapsed to the bare field type `_ t: String`),
  // while every call site passes the synthesized `__ObjN(...)` struct. Kotlin
  // synthesized its own `PyreonHelpers<Param>` data class — a DIFFERENT type
  // from the literal's `__ObjN`, so it did not compile either.
  it('Swift: an inline-object param is typed as the synthesized struct, not a tuple', () => {
    const r = swift(
      `${PRIM}function f(t: { c: string }) { return t.c }\nexport function App(){ return <Text>{f({ c: "x" })}</Text> }`,
    )
    expect(sigLine(r.code)).not.toContain('_ t: String')
    expect(sigLine(r.code)).toContain('_ t: __Obj0')
  })
})

describe('parse.ts — parseStatementBlock: multi-declarator split', () => {
  const helper = (stmts: string) =>
    `${PRIM}const g = (o: { b: number; c: number }): number => { ${stmts} }\nexport function App(){ return <Text>{g({ b: 1, c: 2 })}</Text> }`

  it('a destructured declarator inside a multi-declarator is EXPANDED, not dropped (fixed)', () => {
    // Pre-fix each declarator went through bare parseStatement, which has no
    // name for an ObjectPattern and returned null with NO warning — `b` was
    // then read undeclared.
    const r = swift(helper('const n = 1, { b } = o; return b + n'))
    expect(r.code).toContain('let n = 1')
    expect(r.code).toMatch(/let (__pyDestr\d+) = o\n\s+let b = \1\.b/)
  })

  it('plain multi-declarators split into one binding each', () => {
    const r = kotlin(helper('const n = 1, m = 2; return n + m'))
    expect(r.code).toContain('val n = 1')
    expect(r.code).toContain('val m = 2')
  })

  it('a nested destructure in a helper body warns by name', () => {
    const r = swift(
      `${PRIM}const g = (o: { a: { b: number } }): number => { const { a: { b } } = o; return b }\nexport function App(){ return <Text>{g({ a: { b: 1 } })}</Text> }`,
    )
    expect(r.warnings.join('\n')).toContain('Nested / rest / default destructuring in a function body')
  })

  it('an un-braced if/else whose branches drop to nothing still emits the if', () => {
    const r = swift(helper('let n = 0; if (n > 0) lbl: {} else lbl2: {} return n'))
    expect(r.code).toContain('if n > 0 {')
    expect(r.warnings.join('\n')).toContain('A labeled statement is only supported on a LOOP')
  })

  it('a single-statement while body that drops to nothing yields an empty loop', () => {
    const r = swift(helper('let n = 0; while (n < 1) lbl: {} return n'))
    expect(r.code).toContain('while n < 1 {')
  })

  it('a labeled for-of whose binding is unsupported drops the loop and keeps no label', () => {
    const r = swift(helper('outer: for (const { z } of [o]) {} return 0'))
    expect(r.code).not.toContain('outer:')
    expect(r.warnings.join('\n')).toContain('Unsupported for-of binding')
  })
})

describe('parse.ts — parseArrowParams: parameter shapes', () => {
  it('a defaulted, destructured, array-pattern and rest param mix is skipped with a named warning', () => {
    const r = swift(`${PRIM}const f = (x = 0, { a }, [q], ...rest) => x + a\nexport function App(){ return <Text>{String(f)}</Text> }`)
    expect(r.warnings.join('\n')).toContain('f is a top-level helper function whose return type couldn')
  })

  it('an un-annotated defaulted param crosses with its default', () => {
    const r = kotlin(`${PRIM}const f = (x = 2): number => x * 2\nexport function App(){ return <Text>{f()}</Text> }`)
    expect(r.code).toMatch(/fun f\(x: \w+ = 2\): Int/)
  })

  it('an un-annotated destructured param still synthesizes its placeholder', () => {
    const r = swift(`${PRIM}const f = ({ a }): number => 1\nexport function App(){ return <Text>{String(f)}</Text> }`)
    expect(r.code).toMatch(/func f\(_ __p0: Any\)/)
  })
})

describe('parse.ts — parseExpr: rare expression arms', () => {
  const comp = (body: string, extraImports = '') =>
    `${PRIM}${extraImports}\nexport function App(){\n${body}\n return <Text>x</Text> }`

  it('JSON.parse and a no-arg JSON.stringify warn with DIFFERENT hints', () => {
    const r = swift(`${PRIM}export function App(){ return <Text>{JSON.parse("1")}{JSON.stringify()}</Text> }`)
    const w = r.warnings.join('\n')
    expect(w).toContain('JSON.parse throws on malformed input')
    expect(w).toContain('`JSON.stringify` is not supported in native (PMTC) — no native lowering for this shape yet')
  })

  it('a block-body handler with a bare `return` lowers to an empty action', () => {
    const r = swift(`${PRIM}export function App(){ return <Press onPress={() => { return }}><Text>x</Text></Press> }`)
    expect(r.code).toContain('Text("x")')
    expect(r.warnings).toEqual([])
  })

  it('`[] as Foo` (non-array cast) keeps the bare empty array; `x satisfies T` is transparent', () => {
    const r = kotlin(comp('const h = [] as Foo\n const i = [1] satisfies number[]'))
    expect(r.code).toContain('val i = listOf(1)')
    expect(r.code).not.toContain('emptyList<')
  })

  it('SizedMap: a boolean `lru`, a string-keyed maxEntries, and non-literal props', () => {
    const SM = "import { SizedMap } from '@pyreon/sized-map'"
    const r = swift(
      comp(
        "const y = 1\n const m = new SizedMap<string, number>({ 'maxEntries': 10, lru: true, y })\n const m3 = new SizedMap<string, number>({ maxEntries: 5, lru: false })",
        SM,
      ),
    )
    expect(r.code).toContain('PyreonSizedMap<String, Int>(maxEntries: 10, lru: true)')
    expect(r.code).toContain('PyreonSizedMap<String, Int>(maxEntries: 5)')
  })

  it('SizedMap with a computed cap warns', () => {
    const SM = "import { SizedMap } from '@pyreon/sized-map'"
    const r = swift(comp('const n = 3\n const m = new SizedMap<string, number>({ maxEntries: n })', SM))
    expect(r.warnings.join('\n')).toContain('lowers only with a LITERAL `{ maxEntries: N }`')
  })

  it.each([
    ['a 2-arg generic Map', 'new Map<string, number>(1, 2)', '`new Map` without explicit generic type arguments'],
    ['a Map seeded from a non-array', 'new Map(entries)', 'seeded `new Map([...])`'],
    ['a Map seeded from an EMPTY array', 'new Map([])', 'seeded `new Map([...])`'],
    ['a 2-arg generic Set', 'new Set<number>(1, 2)', '`new Set` without explicit generic type arguments'],
    ['a Set seeded with objects', 'new Set([{ q: 1 }])', 'seeded with non-scalar elements'],
    ['a parenthesized-call callee', 'new (make())()', '`new ParenthesizedExpression()`'],
    ['a member-expression callee', 'new ns.Thing()', '`new MemberExpression()`'],
  ])('%s warns by name', (_label, expr, needle) => {
    const r = swift(comp(`const entries = [1]\n const make = () => 1\n const ns = { Thing: 1 }\n const a = ${expr}`))
    expect(r.warnings.join('\n')).toContain(needle)
  })

  it('a scalar-seeded Set lowers (the positive control)', () => {
    const r = kotlin(comp('const s = new Set([1, 2])'))
    expect(r.code).toContain('val s = (listOf(1, 2)).toMutableSet()')
  })

  it('a toast duration / announce politeness given as an IDENTIFIER is not baked in', () => {
    const r = swift(
      `${PRIM}import { toast } from '@pyreon/toast'\nimport { announce } from '@pyreon/a11y'\nconst d = 5\nconst p = 'assertive'\nexport function App(){ return <Press onPress={() => { toast("m", { duration: d }); announce("a", { politeness: p }) }}><Text>x</Text></Press> }`,
    )
    expect(r.code).toContain('PyreonToast.shared.add("m", type: "info")')
    expect(r.code).toContain('PyreonA11y.announce("a", assertive: false)')
  })
})

describe('parse.ts — parseJsxElement / parseJsxAttr / parseJsxChild', () => {
  it('a member-expression tag `<Foo.Bar/>` keeps a dotted tag', () => {
    const r = swift(`${PRIM}export function App(){ return <Stack><Foo.Bar /></Stack> }`)
    expect(r.code).toContain('Foo_Bar()')
  })

  it('a NAMESPACED attribute warns and is dropped instead of crashing the transform (fixed)', () => {
    // Pre-fix: `TypeError: rawName.startsWith is not a function` — the
    // JSXNamespacedName `.name` is a node, not a string.
    const r = swift(`${PRIM}export function App(){ return <Stack><Text xml:lang="en">hi</Text></Stack> }`)
    expect(r.warnings.join('\n')).toContain('Namespaced JSX attribute `xml:lang`')
    expect(r.code).toContain('Text("hi")')
  })

  it('a spread CHILD `{...xs}` warns instead of vanishing silently (fixed)', () => {
    const r = swift(`${PRIM}const xs = ['a']\nexport function App(){ return <Stack><Text>{...xs}</Text></Stack> }`)
    expect(r.warnings.join('\n')).toContain('A spread JSX child')
  })

  it('a non-string literal `align` is not typo-checked', () => {
    const r = swift(`${PRIM}export function App(){ return <Stack align={1}><Text>x</Text></Stack> }`)
    expect(r.warnings.join('\n')).not.toContain('unrecognized align value')
  })

  it('hook-in-render-callback: only a hook CALL declared in a block-body arrow child is flagged', () => {
    const r = swift(
      `import { Text, Stack, For } from '@pyreon/primitives'\nconst xs = [1]\nexport function App(){ return <Stack><For each={xs} by={(x) => x}>{(x) => { const o = useOnline(); const z = 1; const w = String(x); log(); return <Text>{x}</Text> }}</For><For each={xs} by={(x) => x}>{xs}</For></Stack> }`,
    )
    const hookWarns = r.warnings.filter((w) => w.includes('declared inside <For> render callback'))
    expect(hookWarns).toHaveLength(1)
    expect(hookWarns[0]).toContain('`useOnline(…)`')
  })
})

describe('known bug — block-body <For> render callback', () => {
  // `<For>{(x) => { const z = x + 1; return <Text>{z}</Text> }}</For>` — a
  // block-body render callback (the arrow parses to a multi-statement `stmts`
  // list with a `""` body) — emits `ForEach(…) { x in "" }` / `items(…) { x ->
  // "" }` on both targets with ZERO warnings: the row content was silently
  // dropped. Fixed in native-known-bugs-emit (the `planViewBlock` lowering).
  it('Swift: a block-body For row renders its returned element', () => {
    const r = swift(
      `import { Text, Stack, For } from '@pyreon/primitives'\nconst xs = [1]\nexport function App(){ return <Stack><For each={xs} by={(x) => x}>{(x) => { const z = x + 1; return <Text>{z}</Text> }}</For></Stack> }`,
    )
    expect(r.code).not.toMatch(/\{ x in\n\s*""\n/)
    expect(r.code).toContain('let z = x + 1')
  })
})

describe('parse.ts — lowerUtilityType: shape resolution edges', () => {
  it('Required over an INLINE object literal strips each field optional', () => {
    const k = kotlin(fnWithParams('t: Required<{ c?: string; d: number | null }>'))
    expect(k.warnings.join('\n')).not.toContain('Required<')
    expect(sigLine(k.code)).not.toContain('t: Any')
  })

  it('Required over a GENERIC reference is not resolved as a shape and erases to it', () => {
    const r = swift(fnWithParams('t: Required<Array<number>>'))
    expect(sigLine(r.code)).toContain('_ t: [Int]')
  })

  it('NonNullable of a non-union passes through unchanged', () => {
    const r = swift(fnWithParams('t: NonNullable<string>'))
    expect(sigLine(r.code)).toContain('_ t: String')
  })
})

describe('parse.ts — @pyreon/validate `s` schemas (wrapper-less, schemaFn = null)', () => {
  const V = `${PRIM}import { s } from '@pyreon/validate'\n`
  const warns = (decls: string) =>
    swift(`${V}${decls}\nexport function App(){ return <Text>x</Text> }`).warnings.join('\n')

  it.each([
    ["s.discriminatedUnion(1, [])", 'first arg must be a string literal field name'],
    ["s.discriminatedUnion('k', 5)", 'second arg must be a literal array of s.object() variants'],
    ["s.discriminatedUnion('k', [x])", 'variant 0 is not a s.object() call'],
    ["s.discriminatedUnion('k', [s.object({ x: s.string() })])", `variant 0 doesn't expose s.literal() at "k"`],
  ])('%s warns under the bare `s` prefix', (expr, needle) => {
    const w = warns(`const x = 1\nexport const U = ${expr}`)
    expect(w).toContain('s declaration `U`: s.discriminatedUnion()')
    expect(w).toContain(needle)
  })

  it('a valid discriminated union synthesizes a variant struct per literal', () => {
    const r = swift(
      `${V}export const U = s.discriminatedUnion('k', [s.object({ k: s.literal('a'), inner: s.object({ q: s.string() }) })])\nexport function App(){ return <Text>x</Text> }`,
    )
    expect(r.code).toContain('struct PyreonZodSchema_U_A: Codable {')
    expect(r.code).toContain('struct PyreonZodSchema_U_A_Inner: Codable {')
  })

  it('object-field shape errors name the `s` prefix', () => {
    const w = warns(
      "const shape = {}\nconst other = { string: () => 1 }\nconst foo = () => 1\nexport const G = s.object({ a: 5, b: s.object(shape), c: s.frob(), f: foo(), g: other.string() })",
    )
    expect(w).toContain('s declaration `G`: field `a` is not a s.X() call')
    expect(w).toContain('field `b` is a nested s.object() but its shape isn')
    expect(w).toContain('field `c` uses unsupported s.frob()')
    expect(w).toContain('field `f` has unsupported shape (expected s.string/s.number/s.boolean)')
    expect(w).toContain('field `g` has unsupported shape')
    expect(w).toContain('s declaration `G`: no recognized fields')
  })

  it('a non-literal top-level s.object() shape warns', () => {
    expect(warns('const shape = {}\nexport const H = s.object(shape)')).toContain(
      's declaration `H`: s.object() argument must be a literal shape',
    )
  })

  it('.url() options: non-inline, spread, string-keyed protocol and empty object', () => {
    const r = swift(
      `${V}const o = { protocol: 1 }\nexport const A = s.object({ a: s.string().url(o), b: s.string().url({ 'protocol': /^https$/ }), c: s.string().url({}), d: s.string().url({ ...o }), e: s.array(s.string().url(o)) })\nexport function App(){ return <Text>x</Text> }`,
    )
    const w = r.warnings.join('\n')
    expect(w).toContain('schema field `a` .url(): the options argument is not an inline object')
    expect(w).toContain('schema field `d` .url(): a spread in the options cannot be read')
    expect(w).toContain('schema element .url(): the options argument is not an inline object')
    // The string-keyed `protocol` is honoured; `{}` falls back to the http rule.
    expect(r.code).toContain('range(of: #"^https$"#')
    expect(r.code).toContain('throw PyreonSchemaError.constraintViolation(field: "c", rule: "url")')
  })
})

describe('parse.ts — top-level type aliases: union / enum edges', () => {
  const APPX = '\nexport function App(){ return <Text>x</Text> }'
  it('a leading-pipe single-literal alias still lowers to an enum', () => {
    const r = swift(`${PRIM}type M = | 'a'${APPX}`)
    expect(r.code).toContain('enum M: String, Codable {')
  })

  it('a union of objects with a NON-object branch does not synthesize a merged struct', () => {
    const r = swift(`${PRIM}type U = { a: number } | { b: string } | string${APPX}`)
    expect(r.code).not.toMatch(/^struct U\b/m)
  })

  it('a leading-pipe single-object alias is not treated as a union', () => {
    const r = swift(`${PRIM}type V = | { a: number }${APPX}`)
    expect(r.code).not.toContain('enum V')
  })
})

describe('parse.ts — component-body and hook edges', () => {
  it('an imperative component-body `if` is dropped with the `if` keyword named', () => {
    const r = swift(`${PRIM}export function App(){ let q = 0; if (q > 0) { q = 1 } return <Text>x</Text> }`)
    expect(r.warnings.join('\n')).toContain('a top-level `if` statement has no native lowering and was DROPPED')
  })

  it('useUrlState with a non-finite numeric default is not lowered', () => {
    const r = swift(
      `${PRIM}import { useUrlState } from '@pyreon/url-state'\nexport function App(){ const o = useUrlState('k', 1e999); return <Text>x</Text> }`,
    )
    expect(r.warnings.join('\n')).toContain('useUrlState("k", …) lowers with a STRING, NUMBER or BOOLEAN default')
  })

  it('useQuery: templated fetch URL, non-literal staleTime, and a missing queryFn', () => {
    const Q = `${PRIM}import { useQuery } from '@pyreon/query'\nimport { signal } from '@pyreon/reactivity'\n`
    const tpl = swift(
      `${Q}export function App(){ const id = signal(1); const st = 5; const q = useQuery<string>(() => ({ queryKey: ['u', id()], queryFn: () => fetch(\`https://x.dev/u/\${id()}\`), staleTime: st })); return <Text>x</Text> }`,
    )
    expect(tpl.warnings.join('\n')).toContain('useQuery staleTime must be a number literal (ms)')
    expect(tpl.code).toContain('https://x.dev/u/')
    const noFn = swift(`${Q}export function App(){ const q = useQuery<string>(() => ({ queryKey: ['a'] })); return <Text>x</Text> }`)
    expect(noFn.warnings.join('\n')).toContain('useQuery needs a queryFn to lower to native')
  })

  it('kinetic: a const that does not build on a kinetic() call is not a factory', () => {
    const r = swift(
      `${PRIM}import { kinetic } from '@pyreon/kinetic'\nconst cfg = { value: 1 }\nconst y = cfg.value\nconst z = 2\nconst Fade = kinetic('div').fade()\nexport function App(){ return <Fade><Text>{y}</Text></Fade> }`,
    )
    expect(r.code).not.toContain('cfg_value(')
  })
})

describe('parse.ts — object literals and misc top-level recognizers', () => {
  it('a NUMERIC object key warns instead of vanishing (fixed)', () => {
    const r = swift(`${PRIM}export function App(){ const o = { 1: 'a', b: 2 }; return <Text>{o.b}</Text> }`)
    expect(r.code).toContain('__Obj0(b: 2)')
    expect(r.warnings.join('\n')).toContain('A numeric object key (`{ 1: … }`) is not supported')
  })

  // A same-named ENUM type alias no longer warns: the value side is renamed
  // (`TodoValue`) by the value/type namespace pass, so the pair compiles.
  it('defineFeature colliding with a same-named ENUM type alias renames the value', () => {
    const r = swift(
      `${PRIM}import { defineFeature } from '@pyreon/feature'\ntype Todo = 'a' | 'b'\nconst Todo = defineFeature({ name: 'todo', schema: { id: 'string' } })\nexport function App(){ return <Text>x</Text> }`,
    )
    expect(r.code).toContain('enum Todo: String')
    expect(r.code).toContain('let TodoValue = PyreonFeature_TodoValue.self')
    expect(r.warnings.join('\n')).not.toContain('a type of the same name is declared')
  })

  it('styled(): an empty declaration value is skipped, the rest lowers', () => {
    const r = swift(
      `${PRIM}import { styled } from '@pyreon/styler'\nconst Box = styled(Text)\`\n  color: ;\n  padding: 4px;\n\`\nexport function App(){ return <Box>x</Box> }`,
    )
    expect(r.code).toContain('.padding(4)')
    expect(r.code).not.toContain('foregroundColor')
  })

  it('SizedMap: a non-numeric, non-boolean `lru` is ignored', () => {
    const r = swift(
      `${PRIM}import { SizedMap } from '@pyreon/sized-map'\nexport function App(){ const m = new SizedMap<string, number>({ maxEntries: 5, lru: 'yes' }); return <Text>x</Text> }`,
    )
    expect(r.code).toContain('PyreonSizedMap<String, Int>(maxEntries: 5)')
  })

  it('a namespaced JSX TAG (`<svg:rect/>`) falls to the unknown-tag warning', () => {
    const r = swift(`${PRIM}export function App(){ return <Stack><svg:rect /></Stack> }`)
    expect(r.warnings.join('\n')).toContain('<unknown> is a DOM/SVG element with no native lowering')
  })
})

describe('parse.ts — refineReduceSeedFloats: sources it cannot resolve', () => {
  it('reduce over an unresolved struct array, a scalar array, and an unknown binding keeps Int seeds', () => {
    const r = kotlin(
      `${PRIM}import { signal } from '@pyreon/reactivity'\nexport function App(){ const a = signal<Foo[]>([]); const n = signal<number[]>([1]); return <>hello<Text>{String(a().reduce((acc, x) => acc + x.p, 0))}{n().reduce((acc, x) => acc + x, 0)}{String(mystery.reduce((acc, x) => acc + x, 0))}</Text></> }`,
    )
    expect(r.code).toContain('a.fold(0, { acc, x -> acc + x.p })')
    expect(r.code).toContain('n.fold(0, { acc, x -> acc + x })')
    expect(r.code).toContain('mystery.fold(0, { acc, x -> acc + x })')
    expect(r.code).not.toContain('fold(0.0')
  })

  it('a reduce over an inline Double struct array is the positive control (seed widened)', () => {
    const r = kotlin(
      `${PRIM}import { signal } from '@pyreon/reactivity'\nexport function App(){ const a = signal<{ p: number }[]>([{ p: 1.5 }]); return <Text>{String(a().reduce((acc, x) => acc + x.p, 0))}</Text> }`,
    )
    expect(r.code).toContain('fold(0.0')
  })
})

describe('parse.ts — parseStatement: destructures outside a braced block (fixed: now warn)', () => {
  const helper = (stmts: string) =>
    `${PRIM}const g = (o: { b: number; c: number }): number => { ${stmts} }\nexport function App(){ return <Text>{g({ b: 1, c: 2 })}</Text> }`
  const W = 'A destructuring declaration outside a braced block'

  it('an un-braced if body that destructures warns instead of dropping silently', () => {
    const r = swift(helper('let n = 0; if (n > 0) var { c } = o; return n'))
    expect(r.warnings.join('\n')).toContain(W)
  })

  it('a switch case that destructures warns the same way', () => {
    const r = swift(helper('let n = 0; switch (n) { case 1: const { b } = o; break } return n'))
    expect(r.warnings.join('\n')).toContain(W)
  })

  it('an un-braced multi-declarator var warns as a multi-declarator', () => {
    const r = swift(helper('let n = 0; if (n > 0) var p = 1, q = 2; return n'))
    expect(r.warnings.join('\n')).toContain('Unsupported statement: multi-declarator VariableDeclaration (2 decls).')
  })
})

describe('parse.ts — urlRule: an option key that is neither identifier nor literal', () => {
  it('a no-substitution template key IS `protocol` (a non-regex value is then named)', () => {
    const r = swift(
      `${PRIM}import { s } from '@pyreon/validate'\nexport const A = s.object({ a: s.string().url({ [\`protocol\`]: 1 }), b: s.string().url({ [\`protocol\`]: /^https$/ }) })\nexport function App(){ return <Text>x</Text> }`,
    )
    // `` [`protocol`] `` is the key `protocol`: a regex lowers, a non-regex is named.
    expect(r.warnings.join('\n')).toContain('schema field `a` .url() protocol: .regex() needs an inline regular-expression literal')
    expect(r.code).toContain('prefix(while:')
  })

  it('a runtime computed key in the options is named — whether it sets `protocol` is unknown', () => {
    const r = swift(
      `${PRIM}import { s } from '@pyreon/validate'\nexport const A = s.object({ a: s.string().url({ [k]: /^https$/ }) })\nexport function App(){ return <Text>x</Text> }`,
    )
    expect(r.warnings.join('\n')).toContain('the computed key `[k]` in the options cannot be read')
    expect(r.code).not.toContain('prefix(while:')
  })
})

describe('parse.ts — warnIfHookInsideRenderCallback: non-arrow and expression-body children', () => {
  it('a <Show> whose children are an identifier and an expression-body arrow is not flagged', () => {
    const r = swift(
      `${PRIM}import { Show } from '@pyreon/primitives'\nconst content = 'x'\nexport function App(){ return <Stack><Show when={true}>{content}</Show></Stack> }`,
    )
    expect(r.warnings.join('\n')).not.toContain('render callback')
  })
})

describe('parse.ts — classifyForRange: test / update shapes that are not the canonical count', () => {
  const body = (loop: string) =>
    `${PRIM}const ok = (i: number): boolean => i < 3\nfunction g(xs: number[]): number {\n let a = 0\n let j = 0\n const n = 2\n ${loop}\n return a\n}\nexport function App(){ return <Text>{g([1])}</Text> }`
  const RANGE_WARN = 'Only the canonical count-loop lowers to native'

  it.each([
    ['a call test', 'for (let i = 0; ok(i); i++) { a += 1 }'],
    ['the counter on the RIGHT of the test', 'for (let i = 0; 3 > i; i++) { a += 1 }'],
    ['a test on a different variable', 'for (let i = 0; j < 3; i++) { a += 1 }'],
    ['an inequality test', 'for (let i = 0; i !== 3; i++) { a += 1 }'],
    ['an update of a different variable', 'for (let i = 0; i < 3; j++) { a += 1 }'],
    ['a zero step', 'for (let i = 0; i < 3; i += 0) { a += 1 }'],
    ['a non-literal step', 'for (let i = 0; i < 3; i += n) { a += 1 }'],
    ['a multiplicative update', 'for (let i = 0; i < 3; i *= 2) { a += 1 }'],
    ['an ascending test with a decrement', 'for (let i = 0; i < 3; i--) { a += 1 }'],
  ])('%s warns and drops', (_label, loop) => {
    const r = swift(body(loop))
    expect(r.warnings.join('\n')).toContain(RANGE_WARN)
    expect(r.code).not.toContain('for i in')
  })

  it('a descending literal step lowers to a stride (the positive control)', () => {
    const r = swift(body('for (let i = 5; i > 0; i -= 2) { a += i }'))
    expect(r.code).toContain('for i in stride(from: 5, to: 0, by: -2)')
  })
})

describe('parse.ts — SizedMap / signal initial edges', () => {
  it('a SizedMap with NO options object warns about the literal cap', () => {
    const r = swift(
      `${PRIM}import { SizedMap } from '@pyreon/sized-map'\nexport function App(){ const m = new SizedMap<string, number>(); return <Text>x</Text> }`,
    )
    expect(r.warnings.join('\n')).toContain('lowers only with a LITERAL `{ maxEntries: N }`')
  })

  it('an unsupported unary initial (`~` / `typeof`) warns by operator and degrades', () => {
    const r = swift(
      `${PRIM}import { signal } from '@pyreon/reactivity'\nexport function App(){ const a = signal(~1); const b = signal(typeof 1); return <Text>{a()}</Text> }`,
    )
    const w = r.warnings.join('\n')
    expect(w).toContain('Unary operator `~` is not supported')
    expect(w).toContain('Unary operator `typeof` is not supported')
  })
})

describe('parse.ts — assorted guards on reachable shapes', () => {
  it('a doubly-qualified type name `A.B.C` keeps every segment (fixed)', () => {
    // The left of the outer TSQualifiedName is itself qualified (no `.name`);
    // read flat it rendered `.C`, an invalid native type name.
    const r = swift(fnWithParams('x: A.B.C'))
    expect(sigLine(r.code)).toContain('_ x: A.B.C')
  })

  it('the inline-safeParse pre-scan walks past sparse-array holes and still warns on a bare `s`', () => {
    const r = swift(
      `${PRIM}import { s } from '@pyreon/validate'\nconst xs = [, 1]\nexport function App(){ return <Text>{String(xs)}</Text> }`,
    )
    expect(r.warnings.join('\n')).toContain('s (from @pyreon/validate) has NO native lowering')
  })
})
