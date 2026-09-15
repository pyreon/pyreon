// The BAIL arms of `expr-utils.ts` — the paths taken when a walk REFUSES.
//
// `substituteIdentifier` returns null when a nested arrow SHADOWS the name it
// is substituting, and every node kind then has to propagate that null upward
// rather than rebuilding a half-substituted tree. Those propagation arms are
// the largest single block of never-executed branches in the file, and they
// are exactly the ones that matter: a kind that forgets to propagate produces
// a tree where SOME occurrences were replaced and some were not — valid-looking
// code with the wrong variable in it, and no diagnostic.
//
// The reach is `x.update((l) => …)`, whose lowering substitutes `l` with the
// read of `x`; putting `l.map((l) => l)` (a nested arrow re-binding `l`) inside
// each node kind makes that kind's substitution fail and its bail arm run. The
// observable is the documented fallback: the raw `.update(` emit survives, plus
// the named warning — NOT a silently mis-substituted body.
//
// `buildJsonLiteralParts`' own refusals (a spread anywhere in the tree) are the
// same class one file over, so they live here too.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

// ── substituteIdentifier bail propagation ──────────────────────────────────

function updateApp(body: string): string {
  return `import { Stack, Text, Button } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const xs = signal<number[]>([1])
  return (<Stack><Button onPress={() => xs.update((l) => ${body})}>u</Button></Stack>)
}`
}

function result(body: string, target: 'swift' | 'kotlin' = 'swift'): {
  code: string
  bailed: boolean
} {
  const r = transform(updateApp(body), { target })
  return {
    code: r.code,
    bailed: r.warnings.join('\n').includes('`.update(fn)` lowering supports'),
  }
}

describe('substituteIdentifier — a shadowing arrow bails, and EVERY kind propagates it', () => {
  it.each([
    ['array element', `[l.map((l) => l)[0]]`],
    ['object field value', `[({ v: l.map((l) => l)[0] }).v]`],
    ['ternary branch', `(1 > 0 ? l.map((l) => l) : l)`],
    ['binary operand', `[l.map((l) => l)[0] + 1]`],
    ['index', `[l.map((l) => l)[0]]`],
    ['call argument', `l.concat(l.map((l) => l))`],
    ['template interpolation', '[Number(`${l.map((l) => l)[0]}`)]'],
    ['paren inner', `(l.map((l) => l))`],
    ['unary argument', `[-l.map((l) => l)[0]]`],
    ['json-stringify arg', `[JSON.stringify(l.map((l) => l)).length]`],
    ['member object', `[l.map((l) => l).length]`],
    ['spread argument', `[...l.map((l) => l)]`],
  ])('a shadow inside a %s propagates the refusal', (_k, body) => {
    const r = result(body)
    expect(r.bailed).toBe(true)
    // The raw call survives — a bail is a DEFERRAL, never a silent drop.
    expect(r.code).toContain('.update(')
    // …and no assignment was synthesised from a half-substituted tree.
    expect(r.code).not.toContain('xs = ')
  })

  it('the NEGATIVE control: no shadow → the substitution lands and the call disappears', () => {
    const r = result(`l.concat([9])`)
    expect(r.bailed).toBe(false)
    expect(r.code).toContain('xs = (xs + [9])')
    expect(r.code).not.toContain('.update(')
  })

  it('a nested arrow with a DIFFERENT param name is not a shadow — it substitutes', () => {
    const r = result(`l.map((v) => v + 1)`)
    expect(r.bailed).toBe(false)
    expect(r.code).toContain('xs = xs.map(')
  })

  it('KOTLIN bails on the identical shape (the walker is shared, so it must)', () => {
    const r = result(`[l.map((l) => l)[0]]`, 'kotlin')
    expect(r.bailed).toBe(true)
    expect(r.code).toContain('.update(')
  })

  it('the bail WARNING names the remedy, not just the refusal', () => {
    const w = transform(updateApp(`[l.map((l) => l)[0]]`), { target: 'swift' }).warnings.join('\n')
    expect(w).toContain('whose param is not shadowed by a nested arrow')
    expect(w).toContain('Use `.set(read().…)` or rename the colliding inner param')
  })
})

// ── buildJsonLiteralParts — the literal arms and the refusals ──────────────

function webviewApp(data: string): string {
  return `import { Stack, WebView } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const xs = signal<number[]>([1])
  return (<Stack><WebView html="x" data={${data}} /></Stack>)
}`
}

const wv = (data: string, target: 'swift' | 'kotlin' = 'swift'): string =>
  transform(webviewApp(data), { target }).code
    .split('\n')
    .find((l) => l.includes('PyreonWebView')) ?? ''

describe('buildJsonLiteralParts — every literal arm', () => {
  it('`null` and `undefined` both become JSON `null` (undefined has no JSON form)', () => {
    // Omitting the key instead would silently change the object SHAPE, which a
    // hosted page reading `Object.keys` would see.
    expect(wv(`{ a: null, b: undefined }`)).toContain('"{\\"a\\":null,\\"b\\":null}"')
  })

  it('booleans and numbers stringify without quotes; strings are JSON-quoted', () => {
    expect(wv(`{ a: true, b: false, c: 1, d: 'x' }`)).toContain(
      '"{\\"a\\":true,\\"b\\":false,\\"c\\":1,\\"d\\":\\"x\\"}"',
    )
  })

  it('a PAREN wrapper is transparent at any depth', () => {
    expect(wv(`[(1), { a: (2) }]`)).toContain('"[1,{\\"a\\":2}]"')
  })

  it('a NESTED array recurses', () => {
    expect(wv(`{ a: [1, [2, 3]] }`)).toContain('"{\\"a\\":[1,[2,3]]}"')
  })

  it('an EMPTY array and an EMPTY object are valid JSON, not a bail', () => {
    expect(wv(`{ a: [], b: {} }`)).toContain('"{\\"a\\":[],\\"b\\":{}}"')
  })

  it('a runtime value becomes a HOLE the emitter fills with `encode(…)`', () => {
    expect(wv(`{ a: 1, b: xs() }`)).toContain('\\(PyreonJSON.encode(xs))')
    expect(wv(`{ a: 1, b: xs() }`, 'kotlin')).toContain('${PyreonJson.encode(xs)}')
  })
})

describe('buildJsonLiteralParts — the three refusals fall back to whole-value encode', () => {
  it('a TOP-LEVEL spread refuses (the `walk(expr) ? parts : null` false arm)', () => {
    const line = wv(`{ ...base }`)
    expect(line).toContain('PyreonJSON.encode(')
    expect(line).not.toContain('data: "{')
  })

  it('a spread NESTED IN AN ARRAY element propagates the refusal outward', () => {
    const line = wv(`[{ ...base, a: 1 }]`)
    expect(line).toContain('PyreonJSON.encode(')
    expect(line).not.toContain('data: "[')
  })

  it('a spread NESTED IN AN OBJECT FIELD propagates it too', () => {
    const line = wv(`{ a: { ...base, b: 1 } }`)
    expect(line).toContain('PyreonJSON.encode(')
    expect(line).not.toContain('data: "{')
  })

  it('a NON object/array top-level value is refused up front', () => {
    expect(wv(`xs()`)).toContain('PyreonJSON.encode(xs)')
  })

  it('Kotlin refuses the same shapes, its own encoder', () => {
    expect(wv(`{ ...base }`, 'kotlin')).toContain('PyreonJson.encode(')
    expect(wv(`[{ ...base, a: 1 }]`, 'kotlin')).toContain('PyreonJson.encode(')
  })
})

// ── exprReferencesIdent — the remaining ExprIR kinds ───────────────────────

function rangeApp(body: string): string {
  return `import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
export function App() {
  const n = signal(3)
  const s = signal('a')
  const xs = signal<number[]>([1])
  const out = computed(() => Array.from({ length: n() }, (el, i) => ${body}))
  return (<Stack><Text>{out().length}</Text></Stack>)
}`
}

describe('exprReferencesIdent — the less-travelled ExprIR kinds', () => {
  it.each([
    ['nested arrow body', 'xs().map((v) => v + i).length'],
    ['object with a spread', '({ ...{ a: 1 }, b: i }).b'],
    ['deeply nested template', '`${`${i}`}`.length'],
    ['chained member/index/call', 'xs().slice(0, i).map((v) => v).length'],
    ['logical operands', 'i > 0 && i < 9 ? 1 : 0'],
    ['update-shaped arithmetic', 'i + 1 - 1'],
  ])('walks a %s without finding a free `el`', (_k, body) => {
    expect(
      transform(rangeApp(body), { target: 'swift' }).code,
    ).toContain('(0..<n).map({ i in')
  })

  it('and STILL finds `el` when it is buried inside one of them', () => {
    // The walk must be total in BOTH directions — finding nothing is only
    // meaningful if it can find something.
    for (const body of [
      'xs().map((v) => v + el).length',
      '({ a: el }).a',
      '`${el}`.length',
      'xs().slice(0, el).length',
    ]) {
      const r = transform(rangeApp(body), { target: 'swift' })
      expect(r.code).toContain('Array.from(')
      expect(r.warnings.join('\n')).toContain('`Array.from({ length: n })`')
    }
  })
})
