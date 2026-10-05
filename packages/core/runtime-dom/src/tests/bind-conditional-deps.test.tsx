/**
 * Issue #3782 — a compiled reactive attribute whose expression reads a signal
 * CONDITIONALLY (`pending() && !failed()`) went stale.
 *
 * The compiler combined every general reactive attr of a template into one
 * `_bind(() => …)`. `_bind` is the FIXED-dependency fast path: it tracks only
 * on its first run, so a read short-circuited on that run (`failed()` while
 * `pending()` is false) never subscribed, and a later `failed.set(…)` never
 * re-ran the binding. The compiler may only pick `_bind` when the dependency
 * set is provably stable; everything else must be `renderEffect` (verify-mode
 * dep re-collection).
 *
 * Every spec compiles REAL source through `transformJSX` (vitest's own JSX
 * transform never emits `_bind`) and mounts the emitted code. The matrix
 * varies the VALUE SOURCE of the conditional read, not just the one shape in
 * the report: logical &&/||/??, ternary arms, optional chaining, user
 * functions that read conditionally, computeds, and component props.
 */
import { transformJSX, transformJSX_JS } from '@pyreon/compiler'
import { transformSync } from 'esbuild'
import { Fragment, h, _rp, _rpd, cx } from '@pyreon/core'
import { _bind, computed, renderEffect, signal } from '@pyreon/reactivity'
import { _tpl, _bindText, _bindDirect, _mountSlot, _textSlot } from '../template'
import { _applyProps, _setAttr, _setStyle, mountChild, _bindProp } from '../index'

function stripImports(code: string): string {
  return code.replace(/^\s*import\s+.*$/gm, '').trim()
}

function lowerResidualJsx(code: string): string {
  return transformSync(code, {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
}

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  renderEffect,
  _bindText,
  _bindProp,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setAttr,
  _mountSlot,
  _textSlot,
  _rp,
  _rpd,
  _cx: cx,
  h,
  Fragment,
  signal,
  computed,
  document,
} as const

const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

// Both backends must agree: `transformJSX` prefers the native (Rust) binary,
// `transformJSX_JS` is the oracle. Reverting only ONE half of the fix must fail.
let transform: typeof transformJSX = transformJSX

function compile(source: string): string {
  return transform(source, 'test.tsx').code
}

function mountApp(source: string, globals: Record<string, unknown>) {
  const code = compile(source)
  const body = lowerResidualJsx(stripImports(code).replace(/^\s*export\s+/gm, ''))
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `${body}\nreturn App`)
  const App = fn(...DEP_VALUES, ...Object.values(globals)) as () => unknown
  const container = document.createElement('div')
  document.body.appendChild(container)
  const cleanup = mountChild(h(App as never, null), container) ?? (() => {})
  return {
    container,
    code,
    dispose: () => {
      cleanup()
      container.remove()
    },
  }
}

/** Tiny seeded PRNG so the walks are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

interface Sources {
  a: ReturnType<typeof signal<boolean>>
  b: ReturnType<typeof signal<boolean>>
  c: ReturnType<typeof signal<boolean>>
  n: ReturnType<typeof signal<string | null>>
  o: ReturnType<typeof signal<{ v: string } | null>>
}

function makeSources(): Sources {
  return {
    a: signal(false),
    b: signal(false),
    c: signal(false),
    n: signal<string | null>(null),
    o: signal<{ v: string } | null>(null),
  }
}

function randomWrite(s: Sources, r: () => number) {
  const k = Math.floor(r() * 5)
  if (k === 0) s.a.set(r() < 0.5)
  else if (k === 1) s.b.set(r() < 0.5)
  else if (k === 2) s.c.set(r() < 0.5)
  else if (k === 3) s.n.set(r() < 0.4 ? null : r() < 0.5 ? '' : 'n')
  else s.o.set(r() < 0.4 ? null : { v: r() < 0.5 ? 'p' : 'q' })
}

/**
 * `expr` is the JSX source evaluated reactively as the value of `data-x`;
 * `oracle` is the same expression evaluated eagerly against the signals.
 */
const CASES: Array<{ name: string; expr: string; oracle: (s: Sources) => unknown }> = [
  { name: 'a() && !b()  (the report)', expr: 'a() && !b()', oracle: (s) => s.a() && !s.b() },
  { name: 'a() || b()', expr: 'a() || b()', oracle: (s) => s.a() || s.b() },
  { name: 'n() ?? b()', expr: 'n() ?? b()', oracle: (s) => s.n() ?? s.b() },
  { name: 'a() ? b() : c()', expr: 'a() ? b() : c()', oracle: (s) => (s.a() ? s.b() : s.c()) },
  {
    name: 'a() ? b() && c() : n()',
    expr: 'a() ? b() && c() : n()',
    oracle: (s) => (s.a() ? s.b() && s.c() : s.n()),
  },
  { name: 'a() && o()?.v', expr: 'a() && o()?.v', oracle: (s) => s.a() && s.o()?.v },
  { name: 'o()?.v ?? n()', expr: 'o()?.v ?? n()', oracle: (s) => s.o()?.v ?? s.n() },
  { name: 'user fn reads conditionally', expr: 'pick(a)', oracle: (s) => (s.a() ? s.b() : s.c()) },
  { name: 'user fn via member', expr: 'util.pick(a)', oracle: (s) => (s.a() ? s.b() : s.c()) },
  { name: 'computed behind a condition', expr: 'a() && both()', oracle: (s) => s.a() && s.b() && s.c() },
  {
    name: 'template literal w/ conditional',
    expr: '`${a() ? b() : c()}`',
    oracle: (s) => `${s.a() ? s.b() : s.c()}`,
  },
  { name: 'String() of conditional', expr: 'String(a() && !b())', oracle: (s) => String(s.a() && !s.b()) },
  {
    name: 'mixed and/or groups',
    expr: '(a() && b()) || (c() && !a())',
    oracle: (s) => (s.a() && s.b()) || (s.c() && !s.a()),
  },
]

function srcFor(expr: string): string {
  return `
    import { signal, computed } from '@pyreon/reactivity'
    export function App() {
      return <div><i data-x={() => ${expr}} /></div>
    }
  `
}

function render(v: unknown): string | null {
  if (v === true) return ''
  return v == null || v === false ? null : String(v)
}

const BACKENDS: Array<[string, typeof transformJSX]> = [
  ['native', transformJSX],
  ['js', transformJSX_JS as typeof transformJSX],
]

describe.each(BACKENDS)('#3782 — conditional reads in compiled reactive attrs (%s backend)', (_n, tf) => {
  beforeAll(() => {
    transform = tf
  })

  for (const tc of CASES) {
    it(`stays live: ${tc.name}`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const s = makeSources()
        const both = computed(() => s.b() && s.c())
        const pick = (f: () => boolean) => (f() ? s.b() : s.c())
        const util = { pick }
        const { container, dispose } = mountApp(srcFor(tc.expr), { ...s, both, pick, util })
        const el = container.querySelector('i') as HTMLElement
        const r = rng(seed)
        const check = (step: string) => {
          expect(el.getAttribute('data-x'), `${tc.name} seed ${seed} ${step}`).toBe(
            render(tc.oracle(s)),
          )
        }
        check('initial')
        for (let i = 0; i < 40; i++) {
          randomWrite(s, r)
          check(`step ${i}`)
        }
        dispose()
      }
    })
  }

  it('the exact report: Retry re-enables after Start then Fail (disabled prop)', () => {
    const pending = signal(false)
    const failed = signal(false)
    const { container, dispose } = mountApp(
      `
      import { signal } from '@pyreon/reactivity'
      export function App() {
        return <div><button disabled={() => pending() && !failed()}>Retry</button></div>
      }`,
      { pending, failed },
    )
    const btn = container.querySelector('button') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    pending.set(true)
    expect(btn.disabled).toBe(true)
    failed.set(true)
    expect(btn.disabled).toBe(false)
    failed.set(false)
    expect(btn.disabled).toBe(true)
    dispose()
  })

  it('component PROP whose getter reads conditionally (props value source)', () => {
    const a = signal(false)
    const b = signal(false)
    const { container, dispose } = mountApp(
      `
      import { signal } from '@pyreon/reactivity'
      function Btn(props) {
        return <button data-x={props.v}>x</button>
      }
      export function App() {
        return <div><Btn v={a() && !b()} /></div>
      }`,
      { a, b },
    )
    const el = container.querySelector('button') as HTMLElement
    const want = () => (a() && !b() ? '' : null)
    expect(el.getAttribute('data-x')).toBe(want())
    a.set(true)
    expect(el.getAttribute('data-x')).toBe(want())
    b.set(true)
    expect(el.getAttribute('data-x')).toBe(want())
    b.set(false)
    expect(el.getAttribute('data-x')).toBe(want())
    dispose()
  })

  it('direct _bind repro (runtime contract: _bind is fixed-dependency)', () => {
    const pending = signal(false)
    const failed = signal(false)
    let disabled = false
    const stop = _bind(() => {
      disabled = pending() && !failed()
    })
    pending.set(true)
    failed.set(true)
    // Documents the contract the COMPILER must respect: `_bind` never
    // re-collects, so this stays true. (Not a runtime bug — the compiler must
    // not hand `_bind` an expression with conditional reads.)
    expect(disabled).toBe(true)
    stop()
  })

  it('keeps the fast path for provably-stable expressions', () => {
    const src = `
      import { signal } from '@pyreon/reactivity'
      export function App() {
        const a = signal(1); const b = signal(2)
        return <div><i data-x={() => a() + b()} data-y={() => (a() > 1 ? 'big' : 'small')} /></div>
      }`
    const code = compile(src)
    expect(code).toContain('_bind(')
    expect(code).not.toContain('renderEffect(')
  })
})
