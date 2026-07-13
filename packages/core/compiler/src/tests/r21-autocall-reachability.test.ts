/**
 * Round 21 — auto-call reachability + static-attr classification (fuzz-found).
 *
 * The 2026-07 differential-fuzz campaign (see fuzz-equivalence.test.ts)
 * surfaced a systemic hole: the auto-call pass's REACHABILITY differed
 * between backends AND missed whole regions in both:
 *
 *   - JS gate (`referencesSignalVar`) skipped nested Arrow/Function children
 *     → signals inside callbacks were never rewritten in either backend
 *     (`{[1,2].map(i => s1 ? "a" : "b")}` — bare signal fn is ALWAYS truthy).
 *   - Rust never descended into handler bodies at all → the canonical
 *     counter `onClick={() => s1.set(s1 + 1)}` emitted `s1.set(s1 + 1)`
 *     (adds the FUNCTION) on the SHIPPED native backend.
 *   - Rust never descended into nested JSX inside `_mountSlot` re-emits →
 *     `{cond() ? <span id={`v${s1}`}> : null}` stringified the signal's
 *     SOURCE into the DOM attribute.
 *   - Rust's static-attr catch-all silently DROPPED attributes
 *     (`tabIndex={-1}`, `title={1+2}`, `id={("x")}`), and JS dropped
 *     no-substitution template attrs (`id={`x`}`).
 *
 * The unified rule locked here (identical in both backends):
 *   1. Auto-call reaches nested function bodies (shadow-aware) and nested
 *      JSX (attrs + children, any depth).
 *   2. EXACTLY-BARE signal (parens/TS layers transparent) as a DOM-element
 *      attr value or child inside a RE-EMITTED region stays bare — the
 *      runtimes treat callables as reactive accessors (fine-grained binding,
 *      no branch remount). Template-path bindings still call (the emitted
 *      code assigns the VALUE: `t.data = count()` / `setAttribute(...)`).
 *   3. Static-attr classification unwraps parens/TS layers, bakes
 *      literal / no-subst-template / signed-numeric shapes, semantically
 *      omits false/null/undefined, and routes anything else to a one-time
 *      runtime setAttribute — NEVER a silent drop.
 *   4. Duplicate plain JSX attrs dedupe LAST-wins in the template path
 *      (baking both hands the decision to the HTML parser = FIRST-wins,
 *      the opposite semantic) + emit a `duplicate-jsx-attr` warning.
 */
import { describe, expect, it, test } from 'vitest'
import { transformJSX_JS } from '../jsx'

let nativeTransform:
  | ((code: string, filename: string, ssr: boolean, known: string[] | null) => {
      code: string
      warnings: Array<{ message: string; line: number; column: number; code: string }>
    })
  | null = null
try {
  const path = require('node:path')
  const native = require(path.join(__dirname, '..', '..', 'native', 'pyreon-compiler.node'))
  nativeTransform = native.transformJsx
} catch {
  // Native not available — equivalence half skips; JS-form assertions still run.
}

const describeNative = nativeTransform ? describe : describe.skip

const SIG = `import { signal } from "@pyreon/reactivity"\n`
const wrap = (body: string, props = false) =>
  `${SIG}function App(${props ? 'props' : ''}) {\n  const s0 = signal(1)\n  const s1 = signal(5)\n  return ${body}\n}`

// ── The corpus: every fuzz-found shape, minimal form ────────────────────────
const CORPUS: Array<[name: string, src: string]> = [
  ['handler-body-arith', wrap(`<button onClick={() => s1.set(s1 + 1)}>go</button>`)],
  ['map-callback-ternary-attr', wrap(`<ul>{[1,2].map(i => <li title={s1 ? "a" : "b"}>{i}</li>)}</ul>`)],
  ['map-callback-ternary-text', wrap(`<ul>{[1,2].map(i => s1 ? "a" : "b")}</ul>`)],
  ['iife-signal', wrap(`<ul>{(() => s1 ? "a" : "b")()}</ul>`)],
  ['slot-template-literal-attr', wrap('<ul>{s0() ? <span id={`v${s1}`}>x</span> : null}</ul>')],
  ['slot-ternary-attr', wrap(`<ul>{s0() ? <span id={s1 ? "a" : "b"}>x</span> : null}</ul>`)],
  ['slot-bare-attr', wrap(`<ul>{s0() ? <span title={s1}>x</span> : null}</ul>`)],
  ['slot-bare-paren-attr', wrap(`<ul>{s0() ? <img id={(s1)} /> : null}</ul>`)],
  ['slot-bare-child', wrap(`<ul>{s0() ? <span>{s1}</span> : null}</ul>`)],
  ['slot-nested-two-deep', wrap(`<ul>{s0() ? <b><i title={s1 ? "a" : "b"}>x</i></b> : null}</ul>`)],
  ['slot-handler-nested', wrap(`<ul>{s0() ? <button onClick={() => s1.set(s1 + 1)}>go</button> : null}</ul>`)],
  ['paren-literal-attrs', wrap(`<p data-x={("t69")} id={(953)}>x</p>`)],
  ['static-computed-attrs', wrap('<p id={`x`} title={1+2} data-a={-5} data-b={!0}>x</p>')],
  ['nested-computed-attr', wrap(`<div><span title={1+2}>x</span></div>`)],
  ['undefined-attr', wrap(`<div hidden={undefined}><span /></div>`)],
  ['dup-static-attrs', wrap(`<p id="a" title="t" id="b">x</p>`)],
  ['dup-mixed-attrs', wrap(`<button class={s0}><p id={"t82"} title="t3" id={((834))}>{"t22"}</p></button>`, true)],
  ['spread-args-call', wrap(`<ul>{s0() ? <span title={fmt(...parts, s1 ? 1 : 2)}>x</span> : null}</ul>`)],
]

describeNative('R21 — JS ≡ Rust on the fuzz-found corpus (client + SSR)', () => {
  for (const [name, src] of CORPUS) {
    it(`${name}: byte-identical`, () => {
      for (const ssr of [false, true]) {
        const js = transformJSX_JS(src, 'r21.tsx', { ssr }).code
        const rs = nativeTransform!(src, 'r21.tsx', ssr, null).code
        expect(rs, `mode ssr=${ssr}`).toBe(js)
      }
    })
  }
})

describe('R21 — emitted FORM (semantic assertions, JS backend)', () => {
  const t = (src: string) => transformJSX_JS(src, 'r21.tsx').code

  it('handler body auto-calls the signal read: s1.set(s1() + 1)', () => {
    expect(t(CORPUS[0]![1])).toContain('s1.set(s1() + 1)')
  })

  it('.map callback ternary auto-calls: title={s1() ? ...}', () => {
    expect(t(CORPUS[1]![1])).toContain('title={s1() ? "a" : "b"}')
  })

  it('slot template-literal attr auto-calls: `v${s1()}`', () => {
    expect(t(CORPUS[4]![1])).toContain('`v${s1()}`')
  })

  it('EXACTLY-BARE slot attr stays bare (fine-grained accessor binding)', () => {
    expect(t(CORPUS[6]![1])).toContain('title={s1}')
    expect(t(CORPUS[6]![1])).not.toContain('title={s1()}')
  })

  it('EXACTLY-BARE slot child stays bare', () => {
    expect(t(CORPUS[8]![1])).toContain('<span>{s1}</span>')
  })

  it('parens are transparent for the bare-skip: id={(s1)} stays bare', () => {
    expect(t(CORPUS[7]![1])).toContain('id={(s1)}')
  })

  it('paren-wrapped literals BAKE into the template (no runtime setAttribute)', () => {
    const out = t(CORPUS[11]![1])
    expect(out).toContain('data-x=\\"t69\\"')
    expect(out).toContain('id=\\"953\\"')
    expect(out).not.toContain('setAttribute')
  })

  it('no-subst template + signed numeric BAKE; computed pays ONE _setAttr; nothing dropped', () => {
    const out = t(CORPUS[12]![1])
    expect(out).toContain('id=\\"x\\"')
    expect(out).toContain('data-a=\\"-5\\"')
    // Static-but-not-foldable computed attrs fall through to the dynamic path,
    // which now routes through the runtime `_setAttr` normalizer (null/boolean/
    // aria parity with the h() path) instead of a raw setAttribute.
    expect(out).toContain('_setAttr(__root, "title", 1+2)')
    expect(out).toContain('_setAttr(__root, "data-b", !0)')
  })

  it('undefined attr is OMITTED (setAttribute would coerce to the string "undefined")', () => {
    const out = t(CORPUS[14]![1])
    expect(out).not.toContain('hidden')
  })

  it('duplicate static attrs dedupe LAST-wins in the template', () => {
    const out = t(CORPUS[15]![1])
    expect(out).toContain('id=\\"b\\"')
    expect(out).not.toContain('id=\\"a\\"')
  })

  it('duplicate attr emits the duplicate-jsx-attr warning (both backends)', () => {
    const js = transformJSX_JS(CORPUS[15]![1], 'r21.tsx')
    expect(js.warnings.some((w) => w.code === 'duplicate-jsx-attr')).toBe(true)
    if (nativeTransform) {
      const rs = nativeTransform(CORPUS[15]![1], 'r21.tsx', false, null)
      expect(rs.warnings.some((w) => w.code === 'duplicate-jsx-attr')).toBe(true)
    }
  })
})

// Template-path bindings still CALL — the emitted code assigns the VALUE.
describe('R21 — template-path bindings unaffected by the bare-skip', () => {
  const t = (src: string) => transformJSX_JS(src, 'r21.tsx').code

  test('bare signal text child still emits a VALUE binding (auto-called)', () => {
    // The template path binds the value auto-called (`s1()`) — the
    // bare-skip applies ONLY to re-emitted (h-composed) regions.
    const out = t(wrap(`<div>{s1}</div>`))
    expect(out).toContain('bindPolymorphicText(() => (s1()), __t0')
  })

  test('bare signal class attr keeps _bindDirect', () => {
    const out = t(wrap(`<button class={s0}>x</button>`))
    expect(out).toContain('_bindDirect(s0')
  })
})
