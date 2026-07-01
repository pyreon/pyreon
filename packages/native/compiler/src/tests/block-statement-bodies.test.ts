// Tests for Parser-A — BlockStatement arrow function bodies, plus the
// Parser-B (UnaryExpression) and Parser-C (LogicalExpression) gaps that
// together unblock TodoMVC's 4 mutation functions.
//
// Closes the parser-side gaps surfaced by the TodoMVC compile baseline
// snapshot (#834). Together with G6 (#835), these close the
// `BlockStatement` / `UnaryExpression` / `LogicalExpression` warnings
// the baseline captured, plus close the `ConditionalExpression` +
// `UpdateExpression` gaps surfaced by the compile attempt itself.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('Parser-A — const arrow function as DeclIR.function', () => {
  it('parses a multi-statement BlockStatement body', () => {
    const out = transform(
      `
      export function App() {
        const addOne = () => {
          const x = 1
          return x + 1
        }
        return <Text>x</Text>
      }
    `,
      { target: 'swift' },
    )
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('private func addOne()')
    expect(out.code).toContain('let x = 1')
    expect(out.code).toContain('return x + 1')
  })

  it('parses a single-expression concise arrow body as inline return', () => {
    const out = transform(
      `
      export function App() {
        const double = (n: number) => n * 2
        return <Text>x</Text>
      }
    `,
      { target: 'swift' },
    )
    expect(out.warnings).toEqual([])
    // Phase 2 JSX-attr forwarding PR adds `_` external label to function
    // params so call sites match JS-style unnamed-arg shape.
    // Return-inference PR: an unannotated value-returning fn now gets its
    // inferred `-> Int` (was a Void func that dropped the result).
    expect(out.code).toContain('private func double(_ n: Int) -> Int { n * 2 }')
  })

  it('parses if-with-early-return in multi-statement body', () => {
    const out = transform(
      `
      export function App() {
        const guard = () => {
          if (true) return
          return
        }
        return <Text>x</Text>
      }
    `,
      { target: 'swift' },
    )
    expect(out.warnings).toEqual([])
    // \`guard\` is a Swift keyword — gets backtick-escaped (regression for #830)
    expect(out.code).toContain('private func `guard`()')
    expect(out.code).toMatch(/if true \{/)
    expect(out.code).toMatch(/return\n\s*\}/)
  })

  it('parses TodoMVC addTodo shape', () => {
    const out = transform(
      `
      export function App() {
        const todos = signal<number[]>([])
        const draft = signal<string>("")
        let nextId = 1
        const addTodo = () => {
          const text = draft().trim()
          if (text.length === 0) return
          todos.set([...todos(), nextId++])
          draft.set("")
        }
        return <Text>x</Text>
      }
    `,
      { target: 'swift' },
    )
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('private func addTodo()')
    // Phase 2 TS-method translation: `.trim()` rewrites to Swift's
    // canonical String trimming form, and `.length` rewrites to `.count`.
    expect(out.code).toContain(
      'let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)',
    )
    expect(out.code).toContain('if text.count == 0 {')
    // Phase 2.5: nextId++ emits an IIFE that preserves post-increment
    // semantics (old value AND side-effect). Pre-fix shape was
    // `nextId + 1` — wrong VALUE + dropped side-effect.
    expect(out.code).toContain('todos = (todos + [{ let __v = nextId; nextId += 1; return __v }()])')
    expect(out.code).toContain('draft = ""')
  })

  it('Kotlin emit for the same shape', () => {
    const out = transform(
      `
      export function App() {
        const addOne = (n: number): number => n + 1
        return <Text>x</Text>
      }
    `,
      { target: 'kotlin' },
    )
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('fun addOne(n: Int): Int = n + 1')
  })
})

describe('Parser-B — UnaryExpression (`!t.done`)', () => {
  it('parses negation in arrow body', () => {
    const out = transform(
      `
      export function App() {
        const flip = (t: { done: boolean }) => !t.done
        return <Text>x</Text>
      }
    `,
      { target: 'swift' },
    )
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('!t.done')
  })

  it('parses prefix minus', () => {
    const out = transform(
      `
      export function App() {
        const neg = (n: number) => -n
        return <Text>x</Text>
      }
    `,
      { target: 'swift' },
    )
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('-n')
  })
})

describe('Parser-C — LogicalExpression (`a && b`)', () => {
  it('parses && in arrow body', () => {
    const out = transform(
      `
      export function App() {
        const both = (a: boolean, b: boolean) => a && b
        return <Text>x</Text>
      }
    `,
      { target: 'swift' },
    )
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('a && b')
  })

  it('parses || in arrow body', () => {
    const out = transform(
      `
      export function App() {
        const either = (a: boolean, b: boolean) => a || b
        return <Text>x</Text>
      }
    `,
      { target: 'swift' },
    )
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('a || b')
  })
})

describe('Bonus — ConditionalExpression (ternary)', () => {
  it('parses `cond ? a : b` (Swift uses ternary syntax verbatim)', () => {
    const out = transform(
      `
      export function App() {
        const pick = (cond: boolean) => cond ? 1 : 2
        return <Text>x</Text>
      }
    `,
      { target: 'swift' },
    )
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('cond ? 1 : 2')
  })

  it('Kotlin renders ternary as if-expression (idiomatic Kotlin)', () => {
    const out = transform(
      `
      export function App() {
        const pick = (cond: boolean) => cond ? 1 : 2
        return <Text>x</Text>
      }
    `,
      { target: 'kotlin' },
    )
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('if (cond) 1 else 2')
  })
})

describe('Bonus — comparison operators (`===` / `!==`)', () => {
  it("coalesces Pyreon `===` to native `==`", () => {
    const out = transform(
      `
      export function App() {
        const eq = (a: number, b: number) => a === b
        return <Text>x</Text>
      }
    `,
      { target: 'swift' },
    )
    expect(out.warnings).toEqual([])
    // \`===\` coalesces to \`==\` per the parser convention.
    expect(out.code).toContain('a == b')
    expect(out.code).not.toContain('===')
  })

  it('coalesces `!==` to `!=`', () => {
    const out = transform(
      `
      export function App() {
        const ne = (a: number, b: number) => a !== b
        return <Text>x</Text>
      }
    `,
      { target: 'swift' },
    )
    expect(out.code).toContain('a != b')
  })
})

describe('Bonus — UpdateExpression (`x++` post-increment)', () => {
  it('emits IIFE preserving JS post-increment semantics on Swift (old value + side-effect)', () => {
    // Phase 2.5: Swift removed `++`/`--` operators in Swift 3 (not
    // available as expressions OR statements). The canonical Swift
    // workaround is an IIFE that captures the old value, mutates the
    // var, then returns the captured value.
    //
    // Pre-fix shape was `n + 1` — doubly broken: returned the NEW
    // value instead of OLD, AND dropped the side-effect. Real-world
    // hit: TodoMVC's `id: nextId++` got `id=2` on every call,
    // causing duplicate-ID bugs.
    const out = transform(
      `
      export function App() {
        const id = (n: number) => n++
        return <Text>x</Text>
      }
    `,
      { target: 'swift' },
    )
    expect(out.warnings).toEqual([])
    // The IIFE captures the old value, mutates, returns. Order
    // matters: `__v` must be read BEFORE `n += 1`.
    expect(out.code).toContain('{ let __v = n; n += 1; return __v }()')
    expect(out.code).not.toContain('n + 1')
  })

  it('emits native `x++` on Kotlin (Kotlin natively supports post-increment as expression)', () => {
    // Phase 2.5: Kotlin's `++` IS an expression on var bindings —
    // returns the old value and increments. Same semantics as JS,
    // emit verbatim.
    //
    // Pre-fix shape was `n + 1` — same double-bug as Swift. Kotlin
    // didn't NEED the IIFE workaround; it just needed to emit `n++`.
    const out = transform(
      `
      export function App() {
        const id = (n: number) => n++
        return <Text>x</Text>
      }
    `,
      { target: 'kotlin' },
    )
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('n++')
    expect(out.code).not.toMatch(/\bn \+ 1\b/)
  })
})

describe('Bonus — array spread (`[...x, y]`)', () => {
  it('emits `target + [tail]` on Swift', () => {
    const out = transform(
      `
      export function App() {
        const append = (xs: number[], y: number) => [...xs, y]
        return <Text>x</Text>
      }
    `,
      { target: 'swift' },
    )
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('xs + [y]')
  })

  it('emits `target + listOf(tail)` on Kotlin', () => {
    const out = transform(
      `
      export function App() {
        const append = (xs: number[], y: number) => [...xs, y]
        return <Text>x</Text>
      }
    `,
      { target: 'kotlin' },
    )
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('xs + listOf(y)')
  })
})

describe('TodoMVC baseline — Parser-A closes all 3 warning classes', () => {
  // Tracks the same warnings the baseline test in
  // todomvc-baseline.test.ts captured. After Parser-A, B, C — these
  // warnings are GONE from the canonical TodoMVC source.
  it('zero warnings from BlockStatement / Unary / Logical / Conditional / Update', () => {
    const out = transform(
      `
      type Filter = 'all' | 'active' | 'completed'
      type Todo = { id: number; text: string; done: boolean }
      let nextId = 1
      export function TodoApp() {
        const todos = signal<Todo[]>([])
        const draft = signal<string>("")
        const filter = signal<Filter>("all")
        const addTodo = () => {
          const text = draft().trim()
          if (text.length === 0) return
          todos.set([...todos(), { id: nextId++, text, done: false }])
          draft.set("")
        }
        const toggle = (id: number) => {
          todos.set(todos().map(t => t.id === id ? t : t))
        }
        const remove = (id: number) => {
          todos.set(todos().filter(t => t.id !== id))
        }
        return <VStack><Text>x</Text></VStack>
      }
    `,
      { target: 'swift' },
    )
    // Pre-PR baseline had 3 warnings (BlockStatement, UnaryExpression,
    // LogicalExpression). After Parser-A/B/C + ternary + update +
    // spread + comparison, ZERO warnings from these classes.
    const blocking = out.warnings.filter((w) =>
      /BlockStatement|UnaryExpression|LogicalExpression|ConditionalExpression|UpdateExpression/.test(
        w,
      ),
    )
    expect(blocking).toEqual([])
  })
})
