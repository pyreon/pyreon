// OBJECT SPREAD — the four spellings the emitters never claimed.
//
// Both targets recognised exactly ONE shape: a single identifier spread whose
// override keys already exist on the source (`{ ...t, done: !t.done }`, the
// TodoMVC idiom). Everything else fell through to the plain object/tuple emit
// with ZERO warnings. Measured before this fix:
//
//   { ...p }        Swift `{ var c = p; ; return c }()` — an empty statement
//   { ...p, z: 5 }  a NEW key → `c.z = 5` / `p.copy(z = 5)`, no such member
//   { ...p, ...q }  Swift AND Kotlin `()` — Swift's empty TUPLE, i.e. Void,
//                   and it COMPILES, so the value was silently nothing
//   { a: 9, ...p }  byte-IDENTICAL to `{ ...p, a: 9 }` on both targets. JS
//                   answers 1 and 9 (later wins); the emit answered 9 for
//                   both, and compiled everywhere — the worst half.
//
// The order half needed the IR to carry it: fields and spreads lived in two
// arrays with no relative order, so `fields[i].afterSpreads` was added.
//
// Bisect-load-bearing: revert the `planObjectSpread` call in either emitter
// and the shape specs fail (`let r = p` → `{ var c = p; ; return c }()`,
// warnings → `[]`); revert `afterSpreads` in parse.ts and the EXECUTED order
// spec reports `9 9` where JS reports `9 1`.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const app = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
type P = { a: number; b: number }
type Q = { c: number }
export function App() {
  const p: P = { a: 1, b: 2 }
  const q: Q = { c: 3 }
  ${body}
  return (<Stack><Text>{String(r.a)}</Text></Stack>)
}`

const run = (body: string, target: 'swift' | 'kotlin') => transform(app(body), { target })
const rLine = (code: string) =>
  (code.split('\n').find((l) => /\b(let|val) r\b/.test(l)) ?? '').trim()

describe('object spread — every spelling', () => {
  it('the CONTROL (existing-key override) is unchanged', () => {
    expect(rLine(run('const r = { ...p, a: 9 }', 'swift').code)).toBe(
      'let r = { var c = p; c.a = 9; return c }()',
    )
    expect(rLine(run('const r = { ...p, a: 9 }', 'kotlin').code)).toBe('val r = p.copy(a = 9)')
  })

  it('a PLAIN copy is a copy, not an empty statement', () => {
    expect(rLine(run('const r = { ...p }', 'swift').code)).toBe('let r = p')
    expect(rLine(run('const r = { ...p }', 'kotlin').code)).toBe('val r = p.copy()')
    expect(run('const r = { ...p }', 'swift').code).not.toContain('; ; return c')
  })

  it('a NEW key is named, and never assigned to a member that does not exist', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const out = run('const r = { ...p, z: 5 }', target)
      expect(out.warnings.join('\n'), target).toContain('ADDS a key')
      expect(rLine(out.code), target).not.toContain('z')
    }
  })

  it('MULTIPLE sources are named, and never emit ()', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const out = run('const r = { ...p, ...q }', target)
      expect(out.warnings.join('\n'), target).toContain('MULTIPLE sources')
      expect(rLine(out.code), target).not.toMatch(/=\s*\(\)\s*$/)
    }
  })

  it('a spread AFTER a literal field is named (the field is a new key)', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const out = run('const r = { z: 5, ...p }', target)
      expect(out.warnings.join('\n'), target).toContain('ADDS a key')
    }
  })

  // The ORDER shape: the same two literals must NOT emit the same code.
  it('{ a: 9, ...p } and { ...p, a: 9 } emit DIFFERENTLY', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const before = rLine(run('const r = { a: 9, ...p }', target).code)
      const after = rLine(run('const r = { ...p, a: 9 }', target).code)
      expect(before, target).not.toBe(after)
      // the spread WINS when it comes last: the literal field is dead
      expect(before, target).not.toContain('9')
      expect(after, target).toContain('9')
    }
  })

  // The #3409 control: an OPTIONAL source still warns about optionality.
  it('an OPTIONAL spread source still warns (unchanged)', () => {
    const out = transform(
      `import { Stack, Text } from '@pyreon/primitives'
type P = { a: number }
export function f(o: P | undefined): P { return { a: 1, ...o } }
export function App() { return (<Stack><Text>{String(f(undefined).a)}</Text></Stack>) }`,
      { target: 'swift' },
    )
    expect(out.warnings.length).toBeGreaterThan(0)
  })

  it.skipIf(!isSwiftUIAvailable())('iOS: every claimed shape typechecks', () => {
    for (const body of ['const r = { ...p, a: 9 }', 'const r = { ...p }']) {
      const res = validateSwiftTypecheck(run(body, 'swift').code)
      expect(res.ok, `${body}\n${res.error ?? ''}`).toBe(true)
    }
  })

  it.skipIf(!isKotlincAvailable())('Android: every claimed shape compiles', () => {
    for (const body of ['const r = { ...p, a: 9 }', 'const r = { ...p }']) {
      const res = validateKotlin(run(body, 'kotlin').code)
      expect(res.ok, `${body}\n${res.error ?? ''}`).toBe(true)
    }
  })

  // The approximation is LOUD, by design: `{ ...p, ...q }` emits `q`, so a
  // read of a field only `p` carried fails AT ITS USE SITE. That is the whole
  // reason the emit is not left as `()` (Void, which compiles silently).
  it.skipIf(!isSwiftUIAvailable())(
    'iOS: the multi-source approximation fails at the USE site',
    () => {
      const res = validateSwiftTypecheck(run('const r = { ...p, ...q }', 'swift').code)
      // A SKIPPED validator answers ok — assert against the real verdict only.
      if (res.skipped === true) return
      expect(res.ok).toBe(false)
      expect(res.error ?? '').toContain('a')
    },
  )

  // The answer, not the spelling: JS says 9 then 1.
  it.skipIf(!isSwiftcAvailable())('executed: Swift agrees with JS on which side wins', () => {
    const code = transform(
      `import { Stack, Text } from '@pyreon/primitives'
type P = { a: number; b: number }
export function App() {
  const p: P = { a: 1, b: 2 }
  const r1 = { ...p, a: 9 }
  const r2 = { a: 9, ...p }
  return (<Stack><Text>{String(r1.a) + String(r2.a)}</Text></Stack>)
}`,
      { target: 'swift' },
    ).code
    const pick = (n: string) => {
      const l = code.split('\n').find((x) => x.trim().startsWith(`let ${n} =`))
      expect(l, `no ${n}`).toBeDefined()
      return (l as string).trim()
    }
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-spread-'))
    try {
      writeFileSync(
        join(dir, 'main.swift'),
        `import Foundation
struct P { var a: Int; var b: Int }
let p = P(a: 1, b: 2)
${pick('r1')}
${pick('r2')}
print("\\(r1.a) \\(r2.a)")
`,
      )
      execFileSync('swiftc', ['-O', join(dir, 'main.swift'), '-o', join(dir, 'run')], {
        stdio: 'pipe',
      })
      const got = execFileSync(join(dir, 'run'), { encoding: 'utf8' }).trim()
      // JS ground truth, computed here rather than re-typed.
      const js = (() => {
        const o: Record<string, number> = { a: 1, b: 2 }
        // Spelled through an indexed record so TS does not fold the
        // duplicate key away (TS2783) — the whole point is that the two
        // literals disagree at RUNTIME.
        const spreadLast = { ...o, a: 9 }
        const literalFirst = { a: 9, ...o }
        return `${spreadLast['a']} ${literalFirst['a']}`
      })()
      expect(got, `swift=${got} js=${js}`).toBe(js)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
