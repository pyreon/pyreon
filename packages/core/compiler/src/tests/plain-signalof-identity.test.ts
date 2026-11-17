/**
 * Plain Mode `signalOf(x)` keeps the signal's IDENTITY inside JSX, on every
 * element path, in all four implementations (JS and Rust plain pre-pass, JS
 * and Rust JSX pass).
 *
 * The bug: the pre-pass lowers `signalOf(count)` to the bare signal `count`,
 * and the JSX pass then auto-calls a bare known signal inside JSX — so
 * `<Comp v={signalOf(count)} />` compiled to `_rp(() => count())` and
 * `onClick={() => watch(signalOf(count))}` to `watch(count())`: the receiver got
 * the value, not the signal. The pre-pass now writes `SIGNAL_OF_MARK` before
 * the bare reference and both JSX backends treat a marked identifier as the
 * signal itself (`isIdentityRef` / `is_identity_ref`). Every other bare read
 * in the same expression is still auto-called.
 *
 * Each emit is parsed and every `count` reference classified from the AST:
 * a marked one must never be called, an unmarked value read must be.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { transformJSX_JS } from '../jsx'
import { SIGNAL_OF_MARK, transformPlain } from '../plain'

type Native = {
  transformJsx: (
    ...args: [string, string, boolean, string[] | null, boolean?, unknown?, boolean?]
  ) => { code: string }
  transformPlain?: (code: string, filename: string, known: string[] | null) => { code: string } | null
}

let native: Native | null = null

try {
  const here = dirname(fileURLToPath(import.meta.url))
  native = createRequire(import.meta.url)(join(here, '..', '..', 'native', 'pyreon-compiler.node')) as Native
} catch {
  // The JS contract still runs; native parity runs when the addon is built.
}

/** Positions of `signalOf(count)` — each shape also READS another signal, `other`, once. */
const SHAPES: Record<string, { attr?: string; child?: string }> = {
  'prop / attribute value': { attr: 'data-s={signalOf(count)} data-v={other + 1}' },
  'handler argument': { attr: 'onClick={() => watch(signalOf(count), other + 1)}' },
  'ref callback': { attr: 'ref={(el) => bind(el, signalOf(count), other + 1)}' },
  'object value in a handler': { attr: 'onClick={() => store({ s: signalOf(count), v: other + 1 })}' },
  'array element in a handler': { attr: 'onClick={() => use([signalOf(count), other + 1])}' },
  'render prop': { attr: 'data-r={() => watch(signalOf(count), other + 1)}' },
  'call argument child': { child: '{use(signalOf(count), other + 1)}' },
  'function child': { child: '{() => watch(signalOf(count), other + 1)}' },
  'member call on the identity': { attr: 'onClick={() => signalOf(count).set(other + 1)}' },
}

const PATHS: Record<string, (attr: string, child: string) => string> = {
  'template element': (a, c) => `<button ${a}>x${c}</button>`,
  'childless element': (a, c) => (c ? `<div ${a}>${c}</div>` : `<div ${a} />`),
  'void element': (a, c) => (c ? `<p ${a}>${c}</p>` : `<input ${a} />`),
  'self-closing element nested in a template': (a, c) =>
    c ? `<section><b ${a}>${c}</b></section>` : `<section><b ${a} /></section>`,
  'self-closing component': (a, c) => (c ? `<Button ${a}>${c}</Button>` : `<Button ${a} />`),
  'component with children': (a, c) => `<Button ${a}>x${c}</Button>`,
  'member-tag component': (a, c) => (c ? `<Ui.Button ${a}>${c}</Ui.Button>` : `<Ui.Button ${a} />`),
  'fragment child': (a, c) => `<><button ${a}>x${c}</button></>`,
  'spread-carrying element': (a, c) => `<button {...rest} ${a}>x${c}</button>`,
  '<For> row': (a, c) => `<For each={items} by={(r) => r}>{(r) => <li ${a}>x${c}</li>}</For>`,
  '<Show> fallback': (a, c) => `<Show when={ok} fallback={<i ${a}>x${c}</i>}><b /></Show>`,
}

const MODES = [
  { label: 'client', ssr: false, ssrTemplate: false },
  { label: 'ssr', ssr: true, ssrTemplate: false },
  { label: 'ssrTemplate', ssr: true, ssrTemplate: true },
] as const

const source = (jsx: string) =>
  `'use plain'\nimport { state, signalOf } from '@pyreon/core/plain'\nlet items = state([1])\nlet ok = state(true)\nexport const A = (rest) => {\n  let count = state(0)\n  let other = state(1)\n  return ${jsx}\n}`

/** JS pre-pass → JS JSX, and native pre-pass → native JSX; both must agree. */
function compileAll(src: string, ssr: boolean, ssrTemplate: boolean): string {
  const js = transformJSX_JS(src, 'plain.tsx', { ssr, ssrTemplate }).code
  if (native?.transformPlain) {
    const jsPlain = transformPlain(src, 'plain.tsx')!.code
    const rsPlain = native.transformPlain(src, 'plain.tsx', null)!.code
    expect(rsPlain).toBe(jsPlain)
    expect(native.transformJsx(rsPlain, 'plain.tsx', ssr, null, false, undefined, ssrTemplate).code).toBe(js)
  }

  return js
}

type N = { type: string; [k: string]: unknown }
const NON_CHILD_KEYS = new Set(['type', 'start', 'end', 'loc', 'range'])

/**
 * Every `count` reference (the identity — a template's static attribute emit
 * may drop the comment, so the NAME is the identity, not the mark) must stay
 * uncalled; every `other` value reference must be called.
 */
function classify(code: string) {
  const parsed = parseSync('out.tsx', code)
  expect(parsed.errors, code).toEqual([])
  const out = { identity: 0, identityCalled: 0, readsCalled: 0, readsBare: [] as string[] }
  const visit = (node: unknown, parent: N | null): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const n of node) visit(n, parent)

      return
    }
    const n = node as N
    if (typeof n.type !== 'string') return
    if (n.type === 'Identifier' && (n.name === 'count' || n.name === 'other') && parent) {
      const called = parent.type === 'CallExpression' && parent.callee === n
      const declared = parent.type === 'VariableDeclarator' && parent.id === n
      const property = parent.type === 'MemberExpression' && parent.property === n && !parent.computed
      if (!declared && !property) {
        if (n.name === 'count') {
          out.identity++
          if (called) out.identityCalled++
        } else if (called) out.readsCalled++
        else out.readsBare.push(code.slice((n.start as number) - 20, (n.end as number) + 10))
      }
    }
    for (const key of Object.keys(n)) if (!NON_CHILD_KEYS.has(key)) visit(n[key], n)
  }
  visit(parsed.program, null)

  return out
}

describe('Plain Mode signalOf(x) inside JSX keeps the signal — every element path', () => {
  for (const mode of MODES) {
    describe(mode.label, () => {
      for (const [shape, { attr = '', child = '' }] of Object.entries(SHAPES)) {
        for (const [path, build] of Object.entries(PATHS)) {
          it(`${shape} × ${path}`, () => {
            const code = compileAll(source(build(attr, child)), mode.ssr, mode.ssrTemplate)
            const c = classify(code)
            expect(c.identityCalled, code).toBe(0)
            // The neighbouring value read is still a read.
            expect(c.readsBare, code).toEqual([])
            // Not vacuous: the identity survived — unless the compile-to-string
            // SSR emit dropped the whole client-only handler / ref.
            if (c.identity === 0) {
              expect(mode.ssrTemplate, code).toBe(true)
              expect(c.readsCalled, code).toBe(0)
            } else expect(c.readsCalled, code).toBeGreaterThan(0)
          })
        }
      }
    })
  }
})

describe('the mark is inert everywhere else', () => {
  it('classic code (no pre-pass) is unaffected: a bare signal in JSX is still auto-called', () => {
    const src = `const count = signal(0)\nexport const A = () => <Button v={count} onClick={() => watch(count)} />`
    const js = transformJSX_JS(src, 'classic.tsx').code
    expect(js).toContain('_rp(() => count())')
    expect(js).toContain('watch(count())')
    expect(js).not.toContain(SIGNAL_OF_MARK)
  })

  it('outside JSX the lowered reference is the same bare signal, with the mark as a comment', () => {
    const src = `'use plain'\nimport { state, signalOf } from '@pyreon/core/plain'\nlet count = state(0)\nexport const s = signalOf(count)`
    expect(transformPlain(src, 'plain.ts')!.code).toContain(`export const s = ${SIGNAL_OF_MARK}count`)
  })

  it('`{ count: signalOf(count) }` still restores the shorthand', () => {
    const src = `'use plain'\nimport { state, signalOf } from '@pyreon/core/plain'\nlet count = state(0)\nexport const A = () => <Button store={{ count: signalOf(count) }} />`
    expect(compileAll(src, false, false)).toContain('({ count })')
  })
})
