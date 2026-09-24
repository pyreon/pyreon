/**
 * Branch-coverage battery for the classic → Plain Mode codemod
 * (`migrateToPlain`).
 *
 * Each case pairs the source shape that TAKES an arm with the neighbour that
 * must NOT — a decline is asserted by its `code` + the binding it names, a
 * conversion by the emitted text AND by what stayed put.
 *
 * Companion to `plain-migrate.test.ts` (feature semantics).
 */
import { describe, expect, it } from 'vitest'
import { migrateToPlain } from '../plain-migrate'

const R = `import { signal, computed, effect } from '@pyreon/reactivity'\n`
const SIG = `import { signal } from '@pyreon/reactivity'\n`

const codes = (r: ReturnType<typeof migrateToPlain>) => r.declined.map((d) => `${d.name}:${d.code}`)

describe('migrateToPlain — filename → parser language', () => {
  const src = (extra: string) => `${SIG}const a = signal(0)\n${extra}export const read2 = () => a()\n`

  it.each([
    ['a.ts', 'ts'],
    ['a.tsx', 'tsx'],
    ['a.jsx', 'jsx'],
    ['a.js', 'js'],
    ['a.mjs', 'fallback → tsx'],
  ])('%s parses (%s)', (filename) => {
    const out = migrateToPlain(src(''), filename)
    expect(out.converted).toEqual(['a'])
    expect(out.code).toContain('let a = state(0)')
    expect(out.code).toContain('=> a\n')
  })

  it('a .ts file keeps TS-only angle-bracket syntax parseable', () => {
    const out = migrateToPlain(`${SIG}const a = signal(0)\nconst v = <number>plainv\nexport const read = () => [a(), v]\n`, 'a.ts')
    expect(out.converted).toEqual(['a'])
    expect(out.code).toContain('const v = <number>plainv')
    expect(out.code).toContain('[a, v]')
  })
})

describe('migrateToPlain — decline paths', () => {
  it('a SECOND offending reference does not overwrite the first decline', () => {
    const out = migrateToPlain(`${SIG}const a = signal(0)\nuse(a)\na.direct\n`)
    expect(out.declined).toHaveLength(1)
    expect(out.declined[0]!.code).toBe('signal-as-value')
    expect(out.declined[0]!.reason).toContain('used as a VALUE')
  })

  it('a BARE member access (no call) declines with member-access', () => {
    const out = migrateToPlain(`${SIG}const b = signal(1)\nexport const dd = b.direct\n`)
    expect(codes(out)).toEqual(['b:member-access'])
    expect(out.declined[0]!.reason).toContain('`b.direct`')
    expect(out.code).toBeNull()
  })

  it('an OPTIONAL call `x?.()` is not a plain read', () => {
    const out = migrateToPlain(`${SIG}const a = signal(0)\nexport const v = a?.()\n`)
    expect(codes(out)).toEqual(['a:signal-as-value'])
  })

  it('an `.update` callback with a destructured param declines update-complex', () => {
    const out = migrateToPlain(`${SIG}const a = signal({ n: 1 })\na.update(({ n }) => ({ n: n + 1 }))\n`)
    expect(codes(out)).toEqual(['a:update-complex'])
  })

  it('an `.update` callback containing a nested arrow declines update-complex', () => {
    const out = migrateToPlain(`${SIG}const a = signal(0)\na.update((n) => (() => n + 1)())\n`)
    expect(codes(out)).toEqual(['a:update-complex'])
  })

  it('an `.update` callback containing a regex still substitutes', () => {
    const out = migrateToPlain(`${SIG}const a = signal('x')\na.update((n) => (/y/.test(n) ? n : n + '!'))\n`)
    expect(out.declined).toHaveLength(0)
    expect(out.code).toContain("a = (/y/.test(a) ? a : a + '!')")
  })

  it('a member-callee initializer is NOT a reactivity primitive call', () => {
    const out = migrateToPlain(`${SIG}const a = ns.signal(0)\nexport const read = () => a\n`)
    expect(out.code).toBeNull()
    expect(out.converted).toEqual([])
  })

  it('an assignment to a NON-candidate identifier is left alone', () => {
    const out = migrateToPlain(`${SIG}let plain = 1\nconst a = signal(0)\nplain = a()\n`)
    expect(out.declined).toHaveLength(0)
    expect(out.code).toContain('plain = a\n')
  })
})

describe('migrateToPlain — statement + expression breadth', () => {
  const CONVERTED = (extra: string, decl = `const a = signal(0)\n`) =>
    migrateToPlain(`${SIG}${decl}${extra}export const read = () => a()\n`)

  it('`export { … }` without a declaration, and an anonymous default function', () => {
    const out = migrateToPlain(
      `${SIG}const a = signal(0)\nexport { a }\nexport default function () { return a() }\n`,
    )
    expect(out.converted).toEqual(['a'])
    expect(out.code).toContain('export { a }')
    expect(out.code).toContain('export default function () { return a }')
  })

  it('an anonymous default CLASS is walked', () => {
    const out = migrateToPlain(`${SIG}const a = signal(0)\nexport default class { m() { return a() } }\n`)
    expect(out.converted).toEqual(['a'])
    expect(out.code).toContain('return a ')
  })

  it('a bare `return` and a bare `yield` carry no argument', () => {
    const out = CONVERTED(`export function* g() { if (a() > 1) return; yield; yield a() }\n`)
    expect(out.converted).toEqual(['a'])
    expect(out.code).toContain('if (a > 1) return')
    expect(out.code).toContain('yield; yield a }')
  })

  it('`for (;;)` (no init/test/update) and a non-declaration for-init', () => {
    const out = CONVERTED(
      `let i = 0\nexport function f() {\n  for (;;) { if (a() > 1) break }\n  for (i = 0; i < 2; i++) { log(a()) }\n  for (i of list) { log(a()) }\n}\n`,
    )
    expect(out.converted).toEqual(['a'])
    expect(out.code).toContain('if (a > 1) break')
    expect(out.code!.match(/log\(a\)/g) ?? []).toHaveLength(2)
  })

  it('catch WITHOUT a param, and try WITHOUT a finalizer', () => {
    const out = CONVERTED(`export function f() { try { log(a()) } catch { log(a()) } }\n`)
    expect(out.code!.match(/log\(a\)/g) ?? []).toHaveLength(2)
  })

  it('a class with a superClass and a value-less property', () => {
    const out = CONVERTED(`export class K extends Base { p; q = a() }\n`)
    expect(out.code).toContain('class K extends Base { p; q = a }')
  })

  it('a declarator with NO init is shadowed, not classified', () => {
    const out = CONVERTED(`export function f() { let unset; return [unset, a()] }\n`)
    expect(out.converted).toEqual(['a'])
    expect(out.code).toContain('let unset')
  })

  it('an argument-less `signal()` still converts', () => {
    const out = migrateToPlain(`${SIG}const a = signal()\nexport const read = () => a()\n`)
    expect(out.converted).toEqual(['a'])
    expect(out.code).toContain('let a = state()')
  })

  it('array HOLES in patterns, literals and destructuring assignments', () => {
    const out = CONVERTED(`const [, b] = src\nconst arr = [, a()]\n;[, plainTarget] = src2\nexport const x = [b, arr]\n`)
    expect(out.converted).toEqual(['a'])
    expect(out.code).toContain('const arr = [, a]')
    expect(out.code).toContain('const [, b] = src')
  })

  it('a COMPUTED key in a binding pattern is walked', () => {
    const out = CONVERTED(`const { [a()]: picked } = table\nexport const p = picked\n`)
    expect(out.converted).toEqual(['a'])
    expect(out.code).toContain('const { [a]: picked } = table')
  })

  it('a destructuring ASSIGNMENT target falls through the expression switch', () => {
    const out = CONVERTED(`let q\nexport function f() { ({ q } = src); [q] = src2; return a() }\n`)
    expect(out.converted).toEqual(['a'])
    expect(out.code).toContain('({ q } = src)')
  })

  it('a class EXPRESSION is walked', () => {
    const out = CONVERTED(`export const K = class { m() { return a() } }\n`)
    expect(out.converted).toEqual(['a'])
    expect(out.code).toContain('return a ')
  })

  it('a call whose callee is neither Identifier nor MemberExpression', () => {
    const out = CONVERTED(`export const v = (getFn())(a())\n`)
    expect(out.converted).toEqual(['a'])
    expect(out.code).toContain('(getFn())(a)')
  })

  it('JSX: boolean, string-literal and element-valued attributes', () => {
    const out = CONVERTED(`export const V = () => <div hidden id="x" v=<b/>>{a()}</div>\n`)
    expect(out.converted).toEqual(['a'])
    expect(out.code).toContain('hidden id="x" v=<b/>')
    expect(out.code).toContain('{a}')
  })
})

describe('migrateToPlain — declaration kind + import rewriting', () => {
  it('a signal already declared `let` keeps its kind', () => {
    const out = migrateToPlain(`${SIG}let a = signal(0)\nexport const read = () => a()\n`)
    expect(out.converted).toEqual(['a'])
    expect(out.code).toContain('let a = state(0)')
    expect(out.code!.match(/\blet a\b/g) ?? []).toHaveLength(1)
  })

  it('a computed-ONLY file imports `derived` and never `state`', () => {
    const out = migrateToPlain(
      `import { computed } from '@pyreon/reactivity'\nconst d = computed(() => 1)\nexport const read = () => d()\n`,
    )
    expect(out.converted).toEqual(['d'])
    expect(out.code).toContain("import { derived } from '@pyreon/core/plain'")
    expect(out.code).not.toContain('state')
  })

  it('a NON-rewritable reactivity import (default specifier) is left intact', () => {
    const out = migrateToPlain(
      `import R, { signal } from '@pyreon/reactivity'\nconst a = signal(0)\nexport const read = () => [a(), R]\n`,
    )
    expect(out.converted).toEqual(['a'])
    expect(out.code).toContain("import R, { signal } from '@pyreon/reactivity'")
    expect(out.code).toContain("import { state } from '@pyreon/core/plain'")
  })

  it('an ALIASED import that must be KEPT is re-emitted as `imported as local`', () => {
    const out = migrateToPlain(
      `import { signal as sig } from '@pyreon/reactivity'\nconst a = sig(0)\nconst b = sig(1)\nuse(b)\nexport const read = () => a()\n`,
    )
    expect(out.converted).toEqual(['a'])
    expect(codes(out)).toEqual(['b:signal-as-value'])
    expect(out.code).toContain("import { signal as sig } from '@pyreon/reactivity'")
  })

  it('a multi-declarator statement declines with mixed-declaration', () => {
    const out = migrateToPlain(`${R}const a = signal(0), b = 1\nexport const read = () => [a(), b]\n`)
    expect(codes(out)).toEqual(['a:mixed-declaration'])
  })
})
