import { describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { applyFixes, lintFile } from '../runner'
import type { Diagnostic, RuleEntry } from '../types'

/**
 * The `readable` rules: what each reports, what each leaves alone, and the
 * exact text its autofix produces. Every fix test also re-lints the output,
 * because the padding contract is "one --fix pass and the rule is satisfied":
 * a fix that needed a second pass, or that a second pass would change, is a
 * fight with the formatter waiting to happen.
 */

function lint(source: string, rules: Record<string, RuleEntry>, file = '/p/src/a.tsx'): Diagnostic[] {
  return lintFile(file, source, allRules, { rules }).diagnostics
}

function only(id: string, options?: Record<string, unknown>): Record<string, RuleEntry> {
  return { [id]: options ? ['warn', options] : 'warn' }
}

/** Fix, then assert the output is clean and a second pass is a no-op. */
function fixed(source: string, rules: Record<string, RuleEntry>, file = '/p/src/a.tsx'): string {
  const out = applyFixes(source, lint(source, rules, file))
  const again = lint(out, rules, file).filter((d) => d.fix)
  expect(again, 'one --fix pass must satisfy the rule').toEqual([])
  expect(applyFixes(out, lint(out, rules, file))).toBe(out)

  return out
}

const lines = (...l: string[]) => `${l.join('\n')}\n`

// ── padding-between-declarations ─────────────────────────────────────────────

describe('pyreon/padding-between-declarations', () => {
  const R = only('pyreon/padding-between-declarations')

  it('flags adjacent top-level statements when either spans lines, and fixes with one blank line', () => {
    const src = lines(
      'const GAP = 8',
      'export function layout() {',
      '  return GAP',
      '}',
      'export function measure() {',
      '  return 1',
      '}',
    )
    expect(lint(src, R).map((d) => d.loc.line)).toEqual([2, 5])
    expect(fixed(src, R)).toBe(
      lines(
        'const GAP = 8',
        '',
        'export function layout() {',
        '  return GAP',
        '}',
        '',
        'export function measure() {',
        '  return 1',
        '}',
      ),
    )
  })

  it('leaves runs of one-line declarations tight', () => {
    expect(lint(lines('const A = 1', 'const B = 2', 'export const C = 3'), R)).toEqual([])
  })

  it('puts the blank line ABOVE a leading comment, never between comment and code', () => {
    const src = lines('const a = {', '  x: 1,', '}', '// explains b', '/** and more */', 'const b = 2')
    expect(fixed(src, R)).toBe(
      lines('const a = {', '  x: 1,', '}', '', '// explains b', '/** and more */', 'const b = 2'),
    )
  })

  it('keeps a trailing comment on the previous statement where it is', () => {
    const src = lines('const a = {', '  x: 1,', '} // trailing', 'const b = 2')
    expect(fixed(src, R)).toBe(lines('const a = {', '  x: 1,', '} // trailing', '', 'const b = 2'))
  })

  it('a blank line anywhere in the gap satisfies it, even above a comment', () => {
    expect(lint(lines('const a = {', '}', '', '// c', 'const b = 2'), R)).toEqual([])
    expect(lint(lines('const a = {', '}', '// c', '', 'const b = 2'), R)).toEqual([])
  })

  it('a blank line INSIDE a block comment is not a gap', () => {
    const src = lines('const a = {', '}', '/*', '', '*/', 'const b = 2')
    expect(lint(src, R)).toHaveLength(1)
  })

  it('exempts overload signatures (exported or not) from their implementation', () => {
    const src = lines(
      'export function f(a: string): string',
      'export function f(a: number): number',
      'export function f(a: any) {',
      '  return a',
      '}',
      'function g(a: string): void',
      'function g(a: any) {',
      '  void a',
      '}',
    )
    // Only the boundary BETWEEN the two overload groups is reported.
    expect(lint(src, R).map((d) => d.loc.line)).toEqual([6])
  })

  it('ignores the import block and runs of re-exports', () => {
    const src = lines(
      'import {',
      '  a,',
      '} from "./a"',
      'import { b } from "./b"',
      'export {',
      '  c,',
      '} from "./c"',
      'export * from "./d"',
    )
    expect(lint(src, R)).toEqual([])
  })

  it('leaves two statements on one line to the formatter', () => {
    expect(lint('const a = {\n}; const b = 2\n', R)).toEqual([])
  })

  it('applies to class members, with method overloads exempt', () => {
    const src = lines(
      'class C {',
      '  a = 1',
      '  b = 2',
      '  m(x: string): void',
      '  m(x: any) {',
      '    void x',
      '  }',
      '  n() {',
      '    return 1',
      '  }',
      '}',
    )
    expect(lint(src, R).map((d) => d.loc.line)).toEqual([8])
    expect(fixed(src, R)).toContain('  }\n\n  n() {')
  })

  it('a getter/setter pair is two members, not an overload', () => {
    const src = lines('class C {', '  get v() {', '    return 1', '  }', '  set v(x) {', '    void x', '  }', '}')
    expect(lint(src, R)).toHaveLength(1)
  })

  it('never asks for a blank line at the start of a block', () => {
    const src = lines('class C {', '  m() {', '    return 1', '  }', '}')
    expect(lint(src, R)).toEqual([])
  })

  it('keeps CRLF files CRLF', () => {
    const src = 'const a = {\r\n}\r\nconst b = 2\r\n'
    expect(fixed(src, R)).toBe('const a = {\r\n}\r\n\r\nconst b = 2\r\n')
  })

  it('applies in test files too', () => {
    const src = lines("describe('a', () => {", '  it("x", () => {})', '})', "describe('b', () => {})")
    expect(lint(src, R, '/p/src/a.test.ts')).toHaveLength(1)
  })
})

// ── padding-before-return ────────────────────────────────────────────────────

describe('pyreon/padding-before-return', () => {
  const R = only('pyreon/padding-before-return')

  it('flags a return after three statements and fixes it', () => {
    const src = lines(
      'function label(item: { name: string; unit?: string }) {',
      '  const name = item.name.trim()',
      "  const unit = item.unit ?? ''",
      "  const suffix = unit ? ` ${unit}` : ''",
      '  return `${name}${suffix}`',
      '}',
    )
    expect(fixed(src, R)).toBe(
      lines(
        'function label(item: { name: string; unit?: string }) {',
        '  const name = item.name.trim()',
        "  const unit = item.unit ?? ''",
        "  const suffix = unit ? ` ${unit}` : ''",
        '',
        '  return `${name}${suffix}`',
        '}',
      ),
    )
  })

  it('flags a return right after a multi-line statement', () => {
    const src = lines('function f(xs: number[]) {', '  for (const x of xs) {', '    void x', '  }', '  return 1', '}')
    expect(lint(src, R)).toHaveLength(1)
  })

  it('leaves short blocks tight: a guard, a two-liner, a lone return', () => {
    expect(lint(lines('function f(x?: number) {', '  if (!x) return null', '  return x', '}'), R)).toEqual([])
    expect(lint(lines('function f() {', '  const a = 1', '  return a', '}'), R)).toEqual([])
    expect(lint(lines('function f() {', '  return 1', '}'), R)).toEqual([])
  })

  it('a comment above the return already sets it apart', () => {
    const src = lines('function f() {', '  const a = 1', '  const b = 2', '  const c = 3', '  // the sum', '  return a + b + c', '}')
    expect(lint(src, R)).toEqual([])
  })

  it('honours minStatements and afterMultiline', () => {
    const three = lines('function f() {', '  const a = 1', '  const b = 2', '  const c = 3', '  return a + b + c', '}')
    expect(lint(three, only('pyreon/padding-before-return', { minStatements: 4 }))).toEqual([])
    const multi = lines('function f() {', '  const a = {', '    x: 1,', '  }', '  return a', '}')
    expect(lint(multi, R)).toHaveLength(1)
    expect(lint(multi, only('pyreon/padding-before-return', { afterMultiline: false }))).toEqual([])
  })

  it('applies in switch cases, arrow bodies and static blocks', () => {
    const sw = lines(
      'function f(k: string) {',
      '  switch (k) {',
      "    case 'a': {",
      '      const x = 1',
      '      const y = 2',
      '      const z = 3',
      '      return x + y + z',
      '    }',
      "    case 'b':",
      '      g()',
      '      g()',
      '      g()',
      '      return 2',
      '  }',
      '}',
      'declare function g(): void',
    )
    expect(lint(sw, R).map((d) => d.loc.line)).toEqual([7, 13])
    const arrow = lines('const f = () => {', '  a()', '  b()', '  c()', '  return 1', '}', 'declare const a: any, b: any, c: any')
    expect(lint(arrow, R)).toHaveLength(1)
    const stat = lines('class C {', '  static {', '    a()', '    b()', '    c()', '  }', '}')
    expect(lint(stat, R)).toEqual([]) // no return in a static block — nothing to pad
  })
})

// ── padding-between-component-sections ──────────────────────────────────────

describe('pyreon/padding-between-component-sections', () => {
  const R = only('pyreon/padding-between-component-sections')
  const IMPORTS = "import { signal, computed, effect, onMount } from '@pyreon/reactivity'\n"

  it('separates setup, behaviour and render, and fixes all three boundaries in one pass', () => {
    const src =
      IMPORTS +
      lines(
        'export function Counter(props: { step: number }) {',
        '  const count = signal(0)',
        '  const doubled = computed(() => count() * 2)',
        '  const increment = () => count.update((n) => n + props.step)',
        '  effect(() => console.log(doubled()))',
        '  return <button onClick={increment}>{count}</button>',
        '}',
      )
    expect(lint(src, R).map((d) => d.message)).toEqual([
      'Add a blank line between setup and behaviour. Components read setup → behaviour → render.',
      'Add a blank line between behaviour and render. Components read setup → behaviour → render.',
    ])
    expect(fixed(src, R)).toBe(
      IMPORTS +
        lines(
          'export function Counter(props: { step: number }) {',
          '  const count = signal(0)',
          '  const doubled = computed(() => count() * 2)',
          '',
          '  const increment = () => count.update((n) => n + props.step)',
          '  effect(() => console.log(doubled()))',
          '',
          '  return <button onClick={increment}>{count}</button>',
          '}',
        ),
    )
  })

  it('handlers and effects share one section in EITHER order (effect() runs at creation)', () => {
    const effectFirst =
      IMPORTS +
      lines(
        'export const A = () => {',
        '  const n = signal(0)',
        '',
        '  onMount(() => n.set(1))',
        '  const reset = () => n.set(0)',
        '',
        '  return <i onClick={reset}>{n}</i>',
        '}',
      )
    expect(lint(effectFirst, R)).toEqual([])
  })

  it('an unclassified statement joins the section before it', () => {
    const src =
      IMPORTS +
      lines(
        'export function A(props: { a: number }) {',
        '  const n = signal(props.a)',
        '  const twice = props.a * 2',
        '',
        '  return <i>{n}{twice}</i>',
        '}',
      )
    expect(lint(src, R)).toEqual([])
  })

  it('a derived value straight into the return is not a boundary (no section yet)', () => {
    const src = lines('export function Badge(props: { label: string }) {', '  const text = props.label.toUpperCase()', '  return <span>{text}</span>', '}')
    expect(lint(src, R)).toEqual([])
  })

  it('treats `use*` hooks as setup and an early return as render', () => {
    const src = lines(
      "import { useRoute } from '@pyreon/router'",
      'export function Page() {',
      '  const route = useRoute()',
      '  if (!route) return null',
      '  return <h1>{route().path}</h1>',
      '}',
    )
    expect(lint(src, R).map((d) => d.loc.line)).toEqual([4])
  })

  it('ignores PascalCase functions that do not return JSX, and non-components', () => {
    expect(lint(lines('export function Point(x: number) {', '  const s = signal(x)', '  const f = () => s()', '  return { f }', '}'), R)).toEqual([])
    expect(lint(lines('export function helper() {', '  const s = signal(1)', '  const f = () => s()', '  return <i>{f()}</i>', '}'), R)).toEqual([])
  })

  it('recognises an accessor-returning component', () => {
    const src = IMPORTS + lines('export const A = () => {', '  const n = signal(0)', '  return () => <i>{n()}</i>', '}')
    expect(lint(src, R)).toHaveLength(1)
  })

  it('inserts above a leading comment on the next section', () => {
    const src = IMPORTS + lines('export function A() {', '  const n = signal(0)', '  // render', '  return <i>{n}</i>', '}')
    expect(fixed(src, R)).toContain('  const n = signal(0)\n\n  // render\n  return')
  })
})

// ── padding-around-multiline-blocks ──────────────────────────────────────────

describe('pyreon/padding-around-multiline-blocks', () => {
  const R = only('pyreon/padding-around-multiline-blocks')

  it('asks for a blank line before and after a multi-line block', () => {
    const src = lines(
      'function f(xs: number[]) {',
      '  let n = 0',
      '  for (const x of xs) {',
      '    n += x',
      '  }',
      '  return n',
      '}',
    )
    expect(fixed(src, R)).toBe(
      lines(
        'function f(xs: number[]) {',
        '  let n = 0',
        '',
        '  for (const x of xs) {',
        '    n += x',
        '  }',
        '',
        '  return n',
        '}',
      ),
    )
  })

  it('not at the start or end of a block, not before a commented block, not for one-liners', () => {
    expect(lint(lines('function f(x: number) {', '  if (x) {', '    g()', '  }', '}', 'declare function g(): void'), R)).toEqual([])
    expect(lint(lines('function f(x: number) {', '  g()', '  // why', '  if (x) {', '    g()', '  }', '}', 'declare function g(): void'), R)).toEqual([])
    expect(lint(lines('function f(x: number) {', '  g()', '  if (x) g()', '  g()', '}', 'declare function g(): void'), R)).toEqual([])
  })

  it('leaves top-level blocks to padding-between-declarations', () => {
    expect(lint(lines('const a = 1', 'if (a) {', '  void a', '}'), R)).toEqual([])
  })
})

// ── max-jsx-depth ────────────────────────────────────────────────────────────

describe('pyreon/max-jsx-depth', () => {
  const R = only('pyreon/max-jsx-depth')
  const deep = (n: number) => `${'<div>'.repeat(n)}x${'</div>'.repeat(n)}`

  it('reports once per component, naming the subtree to extract', () => {
    const src = lines(
      'export function Page() {',
      `  return <main><section class="hero">${deep(5)}</section></main>`,
      '}',
    )
    const d = lint(src, R)
    expect(d).toHaveLength(1)
    expect(d[0]?.message).toBe(
      'JSX is nested 7 deep (max 6). Extract the `<section class="hero">` subtree into its own component. Deep trees hide structure.',
    )
  })

  it('is quiet at the limit and honours `max`', () => {
    const src = lines('export const A = () => (', `  ${deep(6)}`, ')')
    expect(lint(src, R)).toEqual([])
    expect(lint(src, only('pyreon/max-jsx-depth', { max: 5 }))).toHaveLength(1)
  })

  it('counts render callbacks and JSX in props, but not a nested component definition', () => {
    const viaFor = lines(
      "import { For } from '@pyreon/core'",
      'export function List(props: { rows: string[] }) {',
      `  return <ul><For each={props.rows}>{(r) => <li>${deep(5)}</li>}</For></ul>`,
      '}',
    )
    expect(lint(viaFor, R)).toHaveLength(1)
    const nested = lines(
      'export function Outer() {',
      `  const Inner = () => ${deep(6)}`,
      '  return <div><Inner /></div>',
      '}',
    )
    expect(lint(nested, R)).toEqual([])
  })

  it('fragments and control-flow components add no depth', () => {
    // <For> replaces a .map() without making the tree one level deeper.
    const viaFor = lines(
      "import { For, Show } from '@pyreon/core'",
      'export function T(props: { rows: string[] }) {',
      `  return <table><tbody><For each={props.rows} by={(r) => r}>{(r) => <tr><td><b>{r}</b></td></tr>}</For></tbody></table>`,
      '}',
    )
    expect(lint(viaFor, only('pyreon/max-jsx-depth', { max: 5 }))).toEqual([])
    const viaShow = lines('export const A = () => (', `  <><Show when={true}>${deep(6)}</Show></>`, ')')
    expect(lint(viaShow, R)).toEqual([])
  })

  it('names an element, not a fragment', () => {
    // depth 7 (the fragment adds none): the suggested level-2 root is <nav>.
    const src = lines('export const A = () => (', `  <main><><nav>${deep(5)}</nav></></main>`, ')')
    expect(lint(src, R)[0]?.message).toContain('`<nav>`')
  })
})

// ── no-nested-ternary-branch ─────────────────────────────────────────────────

describe('pyreon/no-nested-ternary-branch', () => {
  const R = only('pyreon/no-nested-ternary-branch')

  it('allows a flat chain in the alternate position', () => {
    expect(lint("export const t = (s: number) => (s > 90 ? 'a' : s > 50 ? 'b' : s > 10 ? 'c' : 'd')\n", R)).toEqual([])
  })

  it('flags a ternary in the consequent or the test, through parentheses', () => {
    const d = lint(
      'declare const a: boolean, b: boolean, c: boolean\nexport const x = a ? (b ? 1 : 2) : 3\nexport const y = (a ? b : c) ? 1 : 2\n',
      R,
    )
    expect(d.map((x) => x.loc.line)).toEqual([2, 3])
    expect(d[0]?.message).toContain('inside another ternary’s branch')
  })

  it('caps a flat chain at maxOutcomes', () => {
    const five = "declare const k: number\nexport const v = k === 1 ? 'a' : k === 2 ? 'b' : k === 3 ? 'c' : k === 4 ? 'd' : 'e'\n"
    const d = lint(five, R)
    expect(d).toHaveLength(1)
    expect(d[0]?.message).toBe(
      'This ternary chain has 5 outcomes (max 4). Use a lookup object, a switch, or an if/else chain. Long chains hide which branch wins.',
    )
    expect(lint(five, only('pyreon/no-nested-ternary-branch', { maxOutcomes: 5 }))).toEqual([])
  })

  it('works inside JSX', () => {
    const src = 'declare const a: boolean, b: boolean\nexport const C = () => <i>{a ? (b ? <b /> : <s />) : null}</i>\n'
    expect(lint(src, R)).toHaveLength(1)
  })
})

// ── shared contract ──────────────────────────────────────────────────────────

describe('readable rules — shared contract', () => {
  const ALL: Record<string, RuleEntry> = {
    'pyreon/padding-between-declarations': 'warn',
    'pyreon/padding-before-return': 'warn',
    'pyreon/padding-between-component-sections': 'warn',
    'pyreon/padding-around-multiline-blocks': 'warn',
    'pyreon/max-jsx-depth': 'warn',
    'pyreon/no-nested-ternary-branch': 'warn',
  }

  it('two rules wanting the same blank line insert it ONCE', () => {
    // The final `return` of a component is both a section boundary and a
    // return after work; both rules fix at the same offset.
    const src = lines(
      "import { signal } from '@pyreon/reactivity'",
      'export function A() {',
      '  const a = signal(1)',
      '  const b = signal(2)',
      '  const c = signal(3)',
      '  return <i>{a}{b}{c}</i>',
      '}',
    )
    const d = lint(src, ALL)
    expect(d.filter((x) => x.loc.line === 6).map((x) => x.ruleId).sort()).toEqual([
      'pyreon/padding-before-return',
      'pyreon/padding-between-component-sections',
    ])
    expect(fixed(src, ALL)).toContain('  const c = signal(3)\n\n  return')
    expect(fixed(src, ALL)).not.toContain('\n\n\n')
  })

  it('skips generated files', () => {
    const body = lines('const a = {', '}', 'const b = 2')
    expect(lint(body, ALL)).toHaveLength(1)
    for (const header of ['// @generated', '// GENERATED by scripts/gen.ts', '/* Do not edit — regenerate */']) {
      expect(lint(`${header}\n${body}`, ALL), header).toEqual([])
    }
    // Past line 3 the header no longer counts.
    expect(lint(`\n\n\n// @generated\n${body}`, ALL)).toHaveLength(1)
  })

  it('every style rule is opt-in, info by default, and skips generated files', () => {
    for (const r of allRules.filter((x) => x.meta.category === 'style')) {
      expect(r.meta.optIn, r.meta.id).toBe(true)
      expect(r.meta.severity, r.meta.id).toBe('info')
      expect(r.meta.skipGenerated, r.meta.id).toBe(true)
    }
  })

  it('every message says what to do and why, in one line', () => {
    const src = lines(
      'declare const a: boolean, b: boolean',
      'export const x = a ? (b ? 1 : 2) : 3',
      'export function f() {',
      '  g()',
      '  g()',
      '  g()',
      '  return 1',
      '}',
      'declare function g(): void',
    )
    for (const d of lint(src, ALL)) {
      expect(d.message, d.ruleId).not.toContain('\n')
      // imperative first, then the reason as its own sentence
      expect(d.message.split('. ').length, d.message).toBeGreaterThanOrEqual(2)
    }
  })
})

// ── statement and node shapes the main specs do not reach ────────────────────

describe('readable rules — less common shapes', () => {
  it('max-jsx-depth names the subtree by its first literal class / id / data-testid', () => {
    const deep = (n: number) => `${'<div>'.repeat(n)}x${'</div>'.repeat(n)}`
    const src = lines(
      'export function Page(p: object, c: string) {',
      `  return <main><section {...p} style="x" class={c} data-testid="hero-root">${deep(5)}</section></main>`,
      '}',
    )
    expect(lint(src, only('pyreon/max-jsx-depth'))[0]?.message).toContain('`<section data-testid="hero-root">`')
  })

  it('max-jsx-depth leaves the JSX of a nested function component to that component', () => {
    const deep = (n: number) => `${'<div>'.repeat(n)}x${'</div>'.repeat(n)}`
    const src = lines(
      'export function Outer() {',
      `  function Inner() { return ${deep(7)} }`,
      '  const Config = { depth: 1 }',
      '  return <div><Inner /></div>',
      '}',
    )
    const d = lint(src, only('pyreon/max-jsx-depth'))
    // Only Inner is too deep; Outer's own tree is two levels.
    expect(d).toHaveLength(1)
    expect(d[0]?.loc.line).toBe(2)
  })

  it('padding-around-multiline-blocks treats a labelled loop and a class static block like any block', () => {
    const R = only('pyreon/padding-around-multiline-blocks')
    const labelled = lines(
      'function f(rows: number[][]) {',
      '  let n = 0',
      '  outer: for (const r of rows) {',
      '    if (r.length === 0) continue outer',
      '  }',
      '  return n',
      '}',
    )
    expect(lint(labelled, R).map((d) => d.message)).toEqual([
      'Add a blank line before this block. A multi-line block is its own paragraph.',
      'Add a blank line after the block above. A multi-line block is its own paragraph.',
    ])
    const staticBlock = lines(
      'class A {',
      '  static {',
      '    const ready = true',
      '    if (ready) {',
      '      A.init()',
      '    }',
      '  }',
      '  static init() {}',
      '}',
    )
    expect(lint(staticBlock, R).map((d) => d.loc.line)).toEqual([4])
  })

  it('padding-between-component-sections: guards, declarations and statements it cannot classify', () => {
    const R = only('pyreon/padding-between-component-sections')
    const src = lines(
      "import { signal } from '@pyreon/reactivity'",
      'export function Card(props: { x?: number; rows: number[] }) {',
      '  const s = signal(0)',
      '  let pending',
      '  const total = sum(props.rows)',
      '  for (const r of props.rows) pending = r',
      '  function onClick() { s.set(1) }',
      '  if (props.x === 0) log(props.x)',
      '  if (props.x === 1) return null',
      '  else log(props.x)',
      '  if (props.x === undefined) {',
      '    log(props.x)',
      '    return null',
      '  }',
      '  return <button onClick={onClick}>{s}</button>',
      '}',
    )
    // setup (signal, then three unclassified statements that join it) →
    // behaviour (the function declaration and the `if` with an `else`, which
    // is not a guard) → render (the block guard ending in `return`).
    expect(lint(src, R).map((d) => [d.loc.line, d.message])).toEqual([
      [7, 'Add a blank line between setup and behaviour. Components read setup → behaviour → render.'],
      [11, 'Add a blank line between behaviour and render. Components read setup → behaviour → render.'],
    ])
  })

  it('component-shape recognises JSX behind a conditional, a logical and a bare return', () => {
    const R = only('pyreon/padding-between-component-sections')
    const body = (ret: string) =>
      lines(
        "import { signal } from '@pyreon/reactivity'",
        'export function A(props: { on: boolean }) {',
        '  const s = signal(0)',
        '  if (!props.on) return',
        `  return ${ret}`,
        '}',
      )
    for (const ret of ['props.on ? <b>{s}</b> : null', 'props.on && <b>{s}</b>']) {
      expect(lint(body(ret), R).map((d) => d.loc.line)).toEqual([4])
    }
  })

  it('padding-between-declarations: re-exports, computed and literal member names, and overloads', () => {
    const R = only('pyreon/padding-between-declarations')
    const reexports = lines("export * from './a'", 'export function f() {', '  return 1', '}')
    expect(lint(reexports, R)).toEqual([])
    // A declaration without a body followed by something other than its
    // implementation is not an overload pair.
    const notOverload = lines('declare function g(a: string): void', 'const h = () => {', '  return 1', '}')
    expect(lint(notOverload, R).map((d) => d.loc.line)).toEqual([2])
    const members = lines(
      'abstract class C {',
      "  'size'(a: string): number",
      "  'size'(a: number): number",
      "  'size'(a: unknown): number {",
      '    return 1',
      '  }',
      '  [key](a: string): void',
      '  [key](a: unknown): void {',
      '    return',
      '  }',
      '  abstract get v(): number',
      '  get v2(): number {',
      '    return 1',
      '  }',
      '}',
    )
    // The literal-named overloads stay glued; computed names cannot be paired,
    // and an abstract getter is not an overload of the next member.
    expect(lint(members, R).map((d) => d.loc.line)).toEqual([7, 8, 11, 12])
  })
})
