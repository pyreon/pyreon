/**
 * A prop-derived `const` is INLINED at every use site — that is the reactivity
 * mechanism (`const full = fmt(props.first)` re-reads the props getter at each
 * binding). The JS backend is the oracle for WHERE that happens; the native
 * backend routes the same expression through several independent code paths,
 * and each one has to agree:
 *
 *   - the fast-path binders (`_bindText` / `_bindDirect` member-receiver forms,
 *     which build their receiver text themselves),
 *   - the expression-kind gate that decides whether the inliner runs at all
 *     (it enumerated a subset of expression kinds — `new`, tagged templates,
 *     TS wrappers, `await`, update expressions and JSX nested in an
 *     expression were missing), and
 *   - the signal auto-call pass, which re-sliced the ORIGINAL source over text
 *     the inliner had already rewritten.
 *
 * Each position below is compiled through the real `transformJSX` entry on
 * both backends; the oracle is that native ≡ JS, that no bare reference to the
 * const survives in a binding (it would capture the setup-time value), and that
 * the emit parses.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

type NativeTransform = (
  code: string,
  filename: string,
  ssr: boolean,
  known: string[] | null,
) => { code: string }

let nativeTransform: NativeTransform | null = null
try {
  const requireAddon = createRequire(import.meta.url)
  const here = dirname(fileURLToPath(import.meta.url))
  const native = requireAddon(join(here, '..', '..', 'native', 'pyreon-compiler.node')) as {
    transformJsx: NativeTransform
  }
  nativeTransform = native.transformJsx
} catch {
  // reported by the presence spec below
}

const INLINED = '(foo(props.n))'

/** Every position a prop-derived `h` can be read from, as an expression. */
const POSITIONS: Array<[string, string]> = [
  ['member-call receiver (fast path)', 'h.c()'],
  ['depth-2 member call (thunk form)', 'h.c.d()'],
  ['member read', 'h.c'],
  ['optional-chain receiver', 'h?.c()'],
  ['receiver and argument', 'h.c(h)'],
  ['callee', 'h()'],
  ['call argument', 'fmt(h)'],
  ['binary operand', 'h.c + 1'],
  ['array element', '[h.c()]'],
  ['object value', '({ k: h.c() })'],
  ['tagged-template substitution', 'tag`x${h}`'],
  ['`new` callee', 'new h.C()'],
  ['`new` argument', 'new C(h)'],
  ['TS `as` wrapper', '(h as never).c()'],
  ['TS non-null wrapper', 'h!.c()'],
  ['template literal', '`a${h.c()}`'],
  ['JSX nested in an expression (child)', 'cond && <b>{h.c()}</b>'],
  ['JSX nested in an expression (attr)', '<b title={h.c()} />'],
]

const WRAPS: Array<[string, (e: string) => string]> = [
  ['text child', (e) => `<div>{${e}}</div>`],
  ['accessor child', (e) => `<div>{() => ${e}}</div>`],
  ['class attr', (e) => `<div class={${e}} />`],
  ['accessor attr', (e) => `<div title={() => ${e}} />`],
  ['component prop', (e) => `<C v={${e}} />`],
]

const program = (jsx: string): string =>
  `function C(props){ const h = foo(props.n); return ${jsx} }`

const js = (src: string, ssr = false): string => transformJSX_JS(src, 'c.tsx', { ssr }).code
const rs = (src: string, ssr = false): string => nativeTransform!(src, 'c.tsx', ssr, null).code

/** Source with the defining declaration removed — what the bindings contain. */
const bindingsOf = (out: string): string => out.replace('const h = foo(props.n);', '')

describe('prop-derived const — position grammar', () => {
  it('the native binary is present (a skipped backend is not coverage)', () => {
    expect(nativeTransform).not.toBeNull()
  })

  for (const [wrapName, wrap] of WRAPS) {
    for (const [posName, expr] of POSITIONS) {
      it(`${wrapName} × ${posName}: native ≡ JS, inlined, parses`, () => {
        if (!nativeTransform) return
        const src = program(wrap(expr))
        for (const ssr of [false, true]) {
          const j = js(src, ssr)
          const n = rs(src, ssr)
          expect(n, `ssr=${ssr}`).toBe(j)
          // No binding may keep a bare reference to `h`: it would capture the
          // setup-time value and never see the prop change. (A user-written
          // arrow is a deliberate skip on BOTH backends — equality above is
          // its contract — and SSR renders once, so only the client emit of a
          // non-arrow position is held to inlining.)
          if (!ssr && !wrapName.startsWith('accessor')) {
            expect(bindingsOf(n)).not.toMatch(/\bh\b/)
            expect(n).toContain(INLINED)
          }
          expect(parseSync('out.tsx', n, { lang: 'tsx' }).errors, `ssr=${ssr}`).toEqual([])
        }
      })
    }
  }
})

describe('prop-derived const mixed with a bare signal in ONE expression', () => {
  // The auto-call pass located signal identifiers by SOURCE position but
  // rebuilt the text from the original source, so inlining was dropped AND —
  // the resolved text being longer — the slice ran past the expression and
  // copied what followed it. Native indexed past the end of the file and
  // panicked on the last expression; JS emitted unparseable output.
  const mixed: Array<[string, string]> = [
    ['conditional', '<div>{s ? h : 1}</div>'],
    ['binary', '<div>{s + h}</div>'],
    ['attr', '<div title={s ? h.c() : 1}>x</div>'],
    ['member receiver', '<div>{s ? h.c() : 1}</div>'],
    ['two inlinings around a signal', '<div>{h + s + h}</div>'],
  ]
  for (const [name, jsx] of mixed) {
    it(`${name}: both backends inline AND auto-call, with no source leaking`, () => {
      if (!nativeTransform) return
      const src =
        `import { signal } from "@pyreon/reactivity"\n` +
        `function C(props){ const s = signal(1); const h = foo(props.n); return ${jsx} }\n` +
        `const tail = 'TAIL_MUST_NOT_LEAK'\n`
      const j = js(src)
      const n = rs(src)
      expect(n).toBe(j)
      expect(n).toContain(INLINED)
      expect(n).toMatch(/\bs\(\)/)
      // The marker appears exactly once — in the real declaration.
      expect(n.split('TAIL_MUST_NOT_LEAK')).toHaveLength(2)
      expect(parseSync('out.tsx', n, { lang: 'tsx' }).errors).toEqual([])
    })
  }
})

describe('the fast path survives where it is sound', () => {
  it('a prop-derived FUNCTION-expression const still binds directly', () => {
    if (!nativeTransform) return
    // `const f = () => props.n` inlines to a fresh function that reads the
    // props getter when called, so capturing it once is live.
    const src = `function C(props){ const f = () => props.n; return <div>{f()}</div> }`
    expect(rs(src)).toBe(js(src))
    expect(rs(src)).toContain('_bindText(')
  })

  it('a prop-derived VALUE const used as a callee takes the general path', () => {
    if (!nativeTransform) return
    // `const f = foo(props.n)` inlines to an expression the fast path would
    // evaluate once and keep — stale on the next prop change.
    const src = `function C(props){ const f = foo(props.n); return <div>{f()}</div> }`
    expect(rs(src)).toBe(js(src))
    expect(rs(src)).not.toContain('_bindText(')
    expect(rs(src)).toContain('(foo(props.n))()')
  })
})
