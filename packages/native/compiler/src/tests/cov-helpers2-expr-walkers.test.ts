// Branch matrices for the three TOTAL ExprIR walkers in `expr-utils.ts` —
// `substituteIdentifier`, `exprReferencesIdent` and `walkLowerParams`
// (`lowerRouteParams`). All three enumerate every ExprIR member deliberately
// (rather than falling through a `default`) so the exhaustiveness check keeps
// working for the next node kind; that discipline is only worth anything if
// each arm is actually EXERCISED, so this file drives one source shape per
// arm through the real `transform()`.
//
// The reaches used here, and why:
//   • `substituteIdentifier` — component-body VALUE CONSTS are inlined at every
//     use site (`inlineValueConsts` in emit-swift), which walks the whole
//     expression tree. So `const K = 2` plus an expression of kind X proves the
//     X arm rebuilds its node with the substitution applied.
//   • `exprReferencesIdent` — the `Array.from({ length: n }, (el, i) => body)`
//     lowering REFUSES when the body references the ELEMENT param (a `{length}`
//     source has no faithful element value). Proving the refusal does NOT fire
//     for a body of kind X means the walker traversed X and found no free `el`.
//   • `walkLowerParams` — a route `loader: (ctx) => body` rewrites
//     `ctx.params.x` to `params["x"]` anywhere in the body, and flags a
//     residual `ctx` read. One body shape per arm.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

// ── substituteIdentifier, via component value-const inlining ────────────────

function constApp(decls: string, ret = '<Text>x</Text>'): string {
  return `import { Stack, Text, Button } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
type P = { a: number }
export function App() {
  const n = signal(1)
  const s = signal('a')
  const xs = signal<number[]>([1, 2])
  const objs = signal<P[]>([])
  const K = 2
${decls}
  return (<Stack>${ret}</Stack>)
}`
}

const sw = (src: string): string => transform(src, { target: 'swift' }).code
const kt = (src: string): string => transform(src, { target: 'kotlin' }).code

describe('substituteIdentifier — one arm per ExprIR kind (value-const inlining)', () => {
  it('binary / comparison / logical rebuild BOTH operand slots', () => {
    const out = sw(constApp(`  const a = computed(() => K + n())
  const b = computed(() => K > n())
  const c = computed(() => K > 0 && n() > K)`, '<Text>{a()}{b()}{c()}</Text>'))
    expect(out).toContain('var a: Int { (2) + n }')
    expect(out).toContain('var b: Bool { (2) > n }')
    // BOTH sides of the `&&` were walked — the right operand's `K` inlined too.
    expect(out).toContain('(2) > 0 && n > (2)')
  })

  it('ternary rebuilds cond, then AND otherwise', () => {
    const out = sw(constApp(`  const a = computed(() => (K > 1 ? K : K + 1))`, '<Text>{a()}</Text>'))
    expect(out).toContain('(2) > 1 ? (2) : (2) + 1')
  })

  it('unary and update walk `argument`', () => {
    const out = sw(constApp(`  const a = computed(() => -K)`, '<Text>{a()}</Text>'))
    expect(out).toContain('-(2)')
  })

  it('member walks `object`; index walks object AND index', () => {
    const out = sw(constApp(`  const a = computed(() => xs()[K])
  const b = computed(() => s().length + K)`, '<Text>{a()}{b()}</Text>'))
    expect(out).toContain('xs[(2)]')
    expect(out).toContain('s.utf16.count + (2)')
  })

  it('call walks the callee AND every argument', () => {
    const out = sw(constApp(`  const a = computed(() => xs().slice(K, K + 1))`, '<Text>{a().length}</Text>'))
    expect(out).toContain('(2)')
    expect(out).not.toContain('slice(K')
  })

  it('array walks every element', () => {
    const out = sw(constApp(`  const a = computed(() => [K, n(), K])`, '<Text>{a().length}</Text>'))
    expect(out).toContain('[(2), n, (2)]')
  })

  it('object walks every field value', () => {
    const out = sw(constApp(`  const a = computed(() => ({ a: K, b: n() }))`, '<Text>{a().a}</Text>'))
    expect(out).toContain('a: (2)')
  })

  it('template walks each interpolated expr, leaving the quasis alone', () => {
    const out = sw(constApp(`  const a = computed(() => \`k=\${K}!\`)`, '<Text>{a()}</Text>'))
    expect(out).toContain('"k=\\((2))!"')
  })

  it('paren walks `inner`', () => {
    const out = sw(constApp(`  const a = computed(() => (K))`, '<Text>{a()}</Text>'))
    expect(out).toContain('((2))')
  })

  it('json-stringify walks its arg', () => {
    const out = sw(constApp(`  const a = computed(() => JSON.stringify({ k: K }))`, '<Text>{a()}</Text>'))
    expect(out).toContain('k: (2)')
  })

  it('arrow walks the body (a non-shadowing param)', () => {
    const out = sw(constApp(`  const a = computed(() => xs().map((v) => v * K))`, '<Text>{a().length}</Text>'))
    expect(out).toContain('v * (2)')
  })

  it('new-collection walks the seed', () => {
    const out = sw(constApp(`  const a = computed(() => new Set([K]))`, '<Text>{a().size}</Text>'))
    expect(out).toContain('Set([(2)])')
  })

  it('literal / identifier arms: an unrelated identifier is returned unchanged', () => {
    const out = sw(constApp(`  const a = computed(() => n() + 1)`, '<Text>{a()}</Text>'))
    expect(out).toContain('n + 1')
  })

  it('KOTLIN keeps the const and does NOT inline — a deliberate per-target split', () => {
    // Only the Swift emit inlines value consts (Swift `let` in a `var body`
    // cannot be read from a computed property, so the const is substituted at
    // the use site); Kotlin emits a real `val` and references it. Asserting
    // the DIFFERENCE keeps a future "make both inline" change honest.
    const out = kt(constApp(`  const a = computed(() => K + n())
  const b = computed(() => \`k=\${K}\`)`, '<Text>{a()}{b()}</Text>'))
    expect(out).toContain('val K = 2')
    expect(out).toContain('K + n')
    expect(out).not.toContain('(2) + n')
  })

  it('`.update(fn)` lowers through the substitution (the walker\'s original caller)', () => {
    const out = sw(
      constApp(
        `  const a = computed(() => n())`,
        '<Button onPress={() => xs.update((l) => l.concat([1]))}>u</Button>',
      ),
    )
    expect(out).toContain('xs = (xs + [1])')
  })

  it('`.update(fn)` BAILS when a nested arrow shadows the param, and warns by name', () => {
    const r = transform(
      constApp(
        `  const a = computed(() => n())`,
        '<Button onPress={() => xs.update((l) => l.map((l) => l + 1))}>u</Button>',
      ),
      { target: 'swift' },
    )
    expect(r.warnings.join('\n')).toContain('`.update(fn)` lowering supports a single-param')
    // The raw `.update(` emit survives — the bail is NOT a silent drop.
    expect(r.code).toContain('.update(')
  })
})

// ── exprReferencesIdent, via the Array.from({length}) element-param guard ────

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

/** True when the range lowering FIRED (so the walker found no free `el`). */
function lowered(body: string): boolean {
  return sw(rangeApp(body)).includes('(0..<n).map({ i in')
}

describe('exprReferencesIdent — the walker reaches every node kind', () => {
  it('the NEGATIVE control: a body that DOES reference `el` refuses + warns', () => {
    const r = transform(rangeApp('el'), { target: 'swift' })
    expect(r.code).toContain('Array.from(')
    expect(r.warnings.join('\n')).toContain('`Array.from({ length: n })`')
    expect(lowered('el')).toBe(false)
  })

  it.each([
    ['binary', 'i * 2'],
    ['comparison', 'i > 1 ? 1 : 0'],
    ['logical', 'i > 0 && i < 9 ? 1 : 0'],
    ['template', '`i=${i}`'],
    ['object', '({ v: i })'],
    ['array', '[i]'],
    ['ternary', 'i > 1 ? i : 0'],
    ['unary', '-i'],
    ['index', 'xs()[i]'],
    ['member', 's().length'],
    ['paren', '(i)'],
    ['call', 'xs().slice(0, i).length'],
    ['json-stringify', 'JSON.stringify({ i })'],
    ['new-collection', 'new Set([i]).size'],
    ['spread inside array', '[...xs(), i].length'],
  ])('walks a %s body without finding a free `el`', (_name, body) => {
    expect(lowered(body)).toBe(true)
  })

  it('arrow SHADOW boundary: a nested arrow re-binding `el` makes it BOUND, not free', () => {
    // `[1].map((el) => …)` re-binds `el`; the occurrence inside is therefore
    // not a free reference and the lowering must still fire.
    expect(lowered('[1].map((el) => el + i)[0]')).toBe(true)
  })
})

// ── walkLowerParams (lowerRouteParams) ──────────────────────────────────────

function routeApp(loader: string): string {
  return `import { Stack, Text } from '@pyreon/primitives'
function User() { return (<Stack><Text>user</Text></Stack>) }
function App() {
  const router = createRouter({ routes: [
    { path: '/users/:id', component: User, loader: ${loader} },
  ] })
  return (<RouterProvider router={router}><RouterView /></RouterProvider>)
}`
}

const loadOf = (loader: string, target: 'swift' | 'kotlin' = 'swift'): string =>
  transform(routeApp(loader), { target }).code
    .split('\n')
    .find((l) => l.includes('PyreonRouteLoader')) ?? ''

describe('walkLowerParams — `ctx.params.x` lowering per ExprIR arm', () => {
  it('member form `ctx.params.id` → a defaulted dict read', () => {
    expect(loadOf('(ctx) => fetchUser(ctx.params.id)')).toContain('(params["id"] ?? "")')
  })

  it('index form `ctx.params["id"]` lowers IDENTICALLY', () => {
    expect(loadOf('(ctx) => fetchUser(ctx.params["id"])')).toContain('(params["id"] ?? "")')
  })

  it('a bare `ctx` read is RESIDUAL — the loader is dropped with a named warning', () => {
    const r = transform(routeApp('(ctx) => fetchUser(ctx)'), { target: 'swift' })
    expect(r.code).not.toContain('PyreonRouteLoader')
    expect(r.warnings.join('\n')).toContain('for something other than `ctx.params.*`')
  })

  it('a NON-params member on ctx (`ctx.request`) is residual too', () => {
    const r = transform(routeApp('(ctx) => fetchUser(ctx.request)'), { target: 'swift' })
    expect(r.warnings.join('\n')).toContain('for something other than `ctx.params.*`')
  })

  it.each([
    ['array', '(ctx) => [ctx.params.id]'],
    ['template', '(ctx) => `u-${ctx.params.id}`'],
    ['ternary', '(ctx) => (1 > 0 ? ctx.params.id : "x")'],
    ['call args', '(ctx) => fetchUser(ctx.params.id, 1)'],
    ['binary', '(ctx) => ctx.params.id + "!"'],
    ['paren', '(ctx) => (ctx.params.id)'],
    ['index on a non-ctx object', '(ctx) => [1][Number(ctx.params.id)]'],
    ['object field', '(ctx) => ({ id: ctx.params.id })'],
    ['unary', '(ctx) => !ctx.params.id'],
    ['json-stringify', '(ctx) => JSON.stringify({ id: ctx.params.id })'],
    ['arrow body', '(ctx) => [1].map((x) => x + Number(ctx.params.id))'],
  ])('descends into a %s body and lowers the param read', (_name, loader) => {
    const line = loadOf(loader)
    expect(line).toContain('params["id"]')
    expect(line).not.toContain('ctx.params')
  })

  it('literal / new-sized-map arms: a param-free loader body is untouched', () => {
    expect(loadOf('() => 1')).toContain('load: { 1 }')
  })

  it('KOTLIN lowers the same body to the same dict read (one shared walker)', () => {
    expect(loadOf('(ctx) => fetchUser(ctx.params.id)', 'kotlin')).toContain('(params["id"] ?: "")')
  })
})
