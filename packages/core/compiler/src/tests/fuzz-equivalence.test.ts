/**
 * Seeded differential fuzz — JS ↔ Rust byte-equivalence at breadth.
 *
 * The hand-curated equivalence corpus (native-equivalence.test.ts, r20 sweep)
 * locks KNOWN shapes; this gate locks the COMBINATORIC space between them. A
 * grammar-based generator produces components mixing signals (bare + called,
 * shadowed + not), conditionals, `.map` callbacks (incl. destructured +
 * signal-shadowing params), nested JSX (attrs + children at depth), event
 * handlers with signal bodies, parenthesized/template/signed-literal attrs,
 * duplicate attrs, spreads, fragments, and components — each seed is run
 * through BOTH backends in BOTH modes (client + SSR) and must be
 * byte-identical AND parse clean.
 *
 * This is the gate that would have caught the 2026-07 auto-call bug family
 * (fuzz-found, runtime-proven, all shipped on the native backend):
 *   - `onClick={() => s.set(s + 1)}` — the canonical counter — emitted
 *     `s.set(s + 1)` (adds the signal FUNCTION) because auto-call never
 *     descended into handler bodies on Rust;
 *   - `{cond() ? <span id={`v${sig}`}> : null}` stringified the signal's
 *     SOURCE CODE into the DOM attribute;
 *   - `title={sig ? "a" : "b"}` inside `.map` was permanently stuck (the
 *     bare signal function is always truthy) in BOTH backends;
 *   - `tabIndex={-1}` / `title={1+2}` / `id={("x")}` attrs were silently
 *     DROPPED by the native backend's static-attr catch-all.
 *
 * Deterministic (mulberry32 PRNG, fixed seed range) — a failure prints its
 * seed; reproduce with the same seed in scripts or a debugger.
 */
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { transformJSX_JS } from '../jsx'

let nativeTransform:
  | ((code: string, filename: string, ssr: boolean, known: string[] | null) => { code: string })
  | null = null
try {
  const path = require('node:path')
  const native = require(path.join(__dirname, '..', '..', 'native', 'pyreon-compiler.node'))
  nativeTransform = native.transformJsx
} catch {
  // Native not available — suite skips (same convention as native-equivalence).
}

const describeNative = nativeTransform ? describe : describe.skip

// ─── Deterministic PRNG ─────────────────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── Grammar ────────────────────────────────────────────────────────────────
interface Ctx {
  rnd: () => number
  signals: string[]
  props: boolean
  depth: number
  idc: { n: number }
}

const pick = <T,>(rnd: () => number, arr: T[]): T => arr[Math.floor(rnd() * arr.length)]!
const TAGS = ['div', 'span', 'ul', 'li', 'section', 'p', 'h1', 'button', 'main', 'a', 'b', 'i']
const VOIDS = ['input', 'br', 'hr', 'img']
const EVENTS = ['onClick', 'onInput', 'onKeyDown', 'onFocusIn']

function genExpr(c: Ctx): string {
  const r = c.rnd()
  if (c.signals.length && r < 0.25) {
    const s = pick(c.rnd, c.signals)
    return c.rnd() < 0.5 ? `${s}()` : s // called vs bare (auto-call path)
  }
  if (c.props && r < 0.4) return `props.${pick(c.rnd, ['x', 'title', 'items', 'label'])}`
  if (r < 0.5) return `"${'t' + Math.floor(c.rnd() * 100)}"`
  if (r < 0.6) return `${Math.floor(c.rnd() * 1000)}`
  if (r < 0.7) return `${genExpr(c)} ? ${genExpr(c)} : ${genExpr(c)}`
  if (r < 0.78) return `${genExpr(c)} + ${genExpr(c)}`
  if (r < 0.86) return '`v${' + genExpr(c) + '}`'
  if (r < 0.93) return `(${genExpr(c)})`
  return `-${Math.floor(c.rnd() * 50)}`
}

function genAttrs(c: Ctx): string {
  const parts: string[] = []
  const n = Math.floor(c.rnd() * 4)
  for (let i = 0; i < n; i++) {
    const r = c.rnd()
    if (r < 0.22) parts.push(`class="${'c' + Math.floor(c.rnd() * 10)}"`)
    else if (r < 0.32) parts.push(`class={${genExpr(c)}}`)
    else if (r < 0.42) parts.push(`id={${genExpr(c)}}`)
    else if (r < 0.54)
      parts.push(
        `${pick(c.rnd, EVENTS)}={() => ${
          c.signals.length
            ? `${pick(c.rnd, c.signals)}.set(${c.rnd() < 0.5 && c.signals.length ? pick(c.rnd, c.signals) + ' + 1' : '1'})`
            : 'void 0'
        }}`,
      )
    else if (r < 0.6 && c.props) parts.push(`{...props}`)
    else if (r < 0.68) parts.push(`data-x={${genExpr(c)}}`)
    else if (r < 0.74) parts.push(`style={{ color: ${genExpr(c)} }}`)
    else if (r < 0.8) parts.push('id={`x`}')
    else if (r < 0.86) parts.push(`tabIndex={-1}`)
    else parts.push(`title="${'t' + Math.floor(c.rnd() * 10)}"`)
  }
  return parts.length ? ' ' + parts.join(' ') : ''
}

function genChild(c: Ctx): string {
  const r = c.rnd()
  if (c.depth > 4 || r < 0.3) {
    if (c.rnd() < 0.5) return `text${Math.floor(c.rnd() * 100)}`
    return `{${genExpr(c)}}`
  }
  if (r < 0.4 && c.signals.length) {
    const s = pick(c.rnd, c.signals)
    return `{${s}() ? ${genElement({ ...c, depth: c.depth + 1 })} : null}`
  }
  if (r < 0.5) {
    const param =
      c.rnd() < 0.3 && c.signals.length ? pick(c.rnd, c.signals) : c.rnd() < 0.5 ? 'it' : '{ id }'
    const body =
      param === '{ id }' ? '<li>{id}</li>' : `<li>{${param === 'it' ? 'it' : param + '()'}}</li>`
    return `{[1,2,3].map((${param}) => ${body})}`
  }
  if (r < 0.55) return `{<><span>a</span><span>b</span></>}`
  return genElement({ ...c, depth: c.depth + 1 })
}

function genElement(c: Ctx): string {
  const r = c.rnd()
  if (r < 0.08) return `<${pick(c.rnd, VOIDS)}${genAttrs(c)} />`
  if (r < 0.16)
    return `<Comp${c.idc.n++ % 3}${genAttrs(c)}>{${genExpr(c)}}</Comp${(c.idc.n - 1) % 3}>`
  const tag = pick(c.rnd, TAGS)
  const nChildren = 1 + Math.floor(c.rnd() * 3)
  const children: string[] = []
  for (let i = 0; i < nChildren; i++) children.push(genChild(c))
  return `<${tag}${genAttrs(c)}>${children.join('')}</${tag}>`
}

function genComponent(seed: number): string {
  const rnd = mulberry32(seed)
  const nSignals = Math.floor(rnd() * 3)
  const signals = Array.from({ length: nSignals }, (_, i) => `s${i}`)
  const props = rnd() < 0.6
  const c: Ctx = { rnd, signals, props, depth: 0, idc: { n: 0 } }
  const lines: string[] = [`import { signal, computed } from "@pyreon/reactivity"`]
  const body: string[] = []
  for (const s of signals) body.push(`  const ${s} = signal(${Math.floor(rnd() * 10)})`)
  if (props && rnd() < 0.5) body.push(`  const derived = props.x + "-d"`)
  if (rnd() < 0.3) body.push(`  const el = <b>static</b>`)
  lines.push(`function App(${props ? 'props' : ''}) {`)
  lines.push(...body)
  lines.push(`  return ${genElement(c)}`)
  lines.push(`}`)
  return lines.join('\n')
}

// ─── The gate ───────────────────────────────────────────────────────────────
const SEEDS = 300 // ~1.2s locally; every seed is reproducible by number

describeNative('seeded differential fuzz — JS ≡ Rust, client + SSR', () => {
  test(`${SEEDS} seeds × 2 modes are byte-identical`, () => {
    const failures: string[] = []
    let firstDivergence = ''
    for (let seed = 1; seed <= SEEDS; seed++) {
      const src = genComponent(seed)
      for (const ssr of [false, true]) {
        const js = transformJSX_JS(src, 'fuzz.tsx', { ssr }).code
        const rs = nativeTransform!(src, 'fuzz.tsx', ssr, null).code
        if (js !== rs) {
          failures.push(`seed=${seed} ssr=${ssr}`)
          if (!firstDivergence) {
            const jl = js.split('\n')
            const rl = rs.split('\n')
            let diff = ''
            for (let i = 0; i < Math.max(jl.length, rl.length); i++) {
              if (jl[i] !== rl[i]) {
                diff = `line ${i}:\n  JS: ${jl[i]}\n  RS: ${rl[i]}`
                break
              }
            }
            firstDivergence = `\n── first divergent source (seed=${seed} ssr=${ssr}) ──\n${src}\n── first differing line ──\n${diff}`
          }
        }
      }
    }
    expect(failures, `divergent seeds: ${failures.join(', ')}${firstDivergence}`).toEqual([])
  })
})
