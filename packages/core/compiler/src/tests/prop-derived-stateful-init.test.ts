/**
 * Prop-derived inlining: WHICH initializers are inlined, and WHERE.
 *
 * A `const` derived from props is inlined at its JSX use sites so each read
 * re-evaluates the live prop. Re-evaluating is only equivalent to reading the
 * const when evaluating the initializer twice is NOT observable. The old check
 * looked only at the initializer's ROOT call, so
 * `const count = props.shared ?? signal(0)` was inlined and every read created
 * a fresh signal (the documented standalone `<Example>` counter never
 * updated).
 *
 * Rule (`initMintsState` / `init_mints_state`): an initializer holding,
 * ANYWHERE in it, a stateful call (STATEFUL_CALLS or the `useX` / `createX`
 * convention), a `new` other than a value constructor (`Date`, `URL`,
 * `RegExp`, `Intl.*`), a class expression, a write (`=`, `++`, `delete`) or
 * an `await` / `yield` is never inlined — the const keeps the value it captured
 * at setup. "Anywhere" includes the body of a function the evaluation can
 * invoke (a call / `new` callee or argument); a function that is only created
 * (the initializer itself, an object-literal method) runs nothing. An
 * unrecognised call (`cx(props.x)`) stays inlined, as before.
 *
 * Where: an inlinable const is inlined on EVERY element path — template
 * element, component prop and child, handlers / `ref` / render props on a
 * component, a childless or spread-carrying element, and a component's
 * function child — not only where the emit happened to slice the expression.
 *
 * Every cell is classified from the parsed emit (does any reference to `d`
 * remain?), and the native backend must be byte-identical.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { transformJSX_JS } from '../jsx'

type NativeTransform = (code: string, filename: string, ssr: boolean, known: null) => { code: string }

let nativeTransform: NativeTransform | null = null

try {
  const requireAddon = createRequire(import.meta.url)
  const here = dirname(fileURLToPath(import.meta.url))
  nativeTransform = (
    requireAddon(join(here, '..', '..', 'native', 'pyreon-compiler.node')) as {
      transformJsx: NativeTransform
    }
  ).transformJsx
} catch {
  // The JS contract still runs; native parity runs when the addon is built.
}

/** Initializers that must NOT be inlined: evaluating them twice is observable. */
const STATEFUL: Record<string, string> = {
  '?? fallback factory': 'props.shared ?? signal(0)',
  '|| fallback factory': 'props.shared || computed(() => 1)',
  'ternary branch': 'props.c ? signal(1) : props.x',
  'call argument': 'mk(props.x, signal(0))',
  'object literal value': '{ v: props.x, s: signal(0) }',
  'array literal element': '[props.x, createStore({})]',
  'template literal': '`${props.x}${useId()}`',
  'new as fallback': 'props.m ?? new Map()',
  'new at the root': 'new AbortController(props.ts)',
  'new inside a value constructor': 'new Date(props.ts ?? new Map())',
  'nested call': 'mk(mk2(props.x, useX()))',
  'member-callee convention': 'props.store.useThing(props.x)',
  'optional-chain call': 'props.o?.useThing()',
  'invoked callback': 'Array.from({ length: props.n }, () => signal(0))',
  'IIFE': '(() => signal(props.x))()',
  'update expression': 'props.x++',
  'assignment': '(seen = props.x)',
  'delete': 'delete props.x',
  'TS wrapper around the operand': '(props.x as any) ?? effect(() => {})',
  'class expression': 'class { v = props.x }',
}

/** Initializers that MUST still be inlined (the reactivity feature). */
const PURE: Record<string, string> = {
  'member read': 'props.x',
  'binary': 'props.x + "-d"',
  'unknown call': 'cx(props.x)',
  'function initializer (only created)': '() => signal(props.x)',
  'object-literal method (only created)': '{ on: () => signal(0), v: props.x }',
  'tagged template': 'tag`${props.x}`',
  'sequence': '(0, props.x)',
  'spread argument': 'mk(...props.items)',
  'value constructor (Date)': 'new Date(props.ts)',
  'value constructor (Intl.*)': 'new Intl.NumberFormat(props.locale)',
  'value constructor inside an invoked callback': 'props.points.map((p) => new Date(p.week).getTime())',
}

const SITES: Record<string, string> = {
  'template child': '<p>{d}</p>',
  'template attribute': '<p title={d}>x</p>',
  'component prop': '<Comp v={d} />',
  'component child': '<Comp>{d}</Comp>',
  'handler, template element': '<button onClick={() => use(d)}>x</button>',
  'handler, component': '<Comp onClick={() => use(d)} />',
  'handler, childless element': '<i onClick={() => use(d)} />',
  'handler, spread element': '<b {...rest} onClick={() => use(d)}>x</b>',
  'ref, template element': '<b ref={(el) => use(el, d)}>x</b>',
  'render prop, component': '<Comp render={() => use(d)} />',
  'function child, component': '<Comp>{() => use(d)}</Comp>',
  'function child, template element': '<div>{() => use(d)}</div>',
}

const source = (init: string, site: string) =>
  `import { signal, computed } from '@pyreon/reactivity'\nlet seen\nexport function C(props) {\n  const d = ${init}\n  return ${site}\n}`

/** References to `d` left in the emit, the declaration itself excluded. */
function refsToD(out: string): number {
  const { program, errors } = parseSync('out.tsx', out)
  expect(errors, out).toEqual([])
  let n = 0
  const walk = (node: unknown, parentKey: string): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const c of node) walk(c, parentKey)
      return
    }
    const o = node as Record<string, unknown>
    if (o.type === 'Identifier' && o.name === 'd' && parentKey !== 'id' && parentKey !== 'property') n++
    for (const [k, v] of Object.entries(o)) if (k !== 'type') walk(v, k)
  }
  walk(program, '')
  return n
}

for (const ssr of [false, true]) {
  describe(`prop-derived initializers × use sites (${ssr ? 'SSR' : 'client'})`, () => {
    for (const [group, shapes, expectInlined] of [
      ['stateful — kept', STATEFUL, false],
      ['pure — inlined', PURE, true],
    ] as const) {
      describe(group, () => {
        for (const [shape, init] of Object.entries(shapes)) {
          for (const [site, jsx] of Object.entries(SITES)) {
            it(`${shape} @ ${site}`, () => {
              const src = source(init, jsx)
              const js = transformJSX_JS(src, 'c.tsx', { ssr }).code
              if (expectInlined) expect(refsToD(js), js).toBe(0)
              else expect(refsToD(js), js).toBeGreaterThan(0)
              if (nativeTransform) expect(nativeTransform(src, 'c.tsx', ssr, null).code).toBe(js)
            })
          }
        }
      })
    }
  })
}

describe('hygiene: an inlined initializer is never captured by a binding at the use site', () => {
  // `lbl`'s inlined text mentions `tag` (and `props`); a use under a binding of
  // either name keeps the const, every other use is still inlined.
  const CASES: Record<string, [string, number]> = {
    'map parameter re-binds a free name': ['<ul>{items.map((tag) => <li title={lbl}>x</li>)}</ul>', 1],
    'handler parameter re-binds a free name': ['<Comp onClick={(tag) => use(lbl, tag)} />', 1],
    'function child parameter re-binds a free name': ['<Comp>{(tag) => use(lbl, tag)}</Comp>', 1],
    'a parameter named props': ['<p>{items.map((props) => use(lbl, props))}</p>', 1],
    'transitively, through another alias': ['<Comp onClick={(tag) => use(b, tag)} />', 1],
    'a local declaration in a handler body': ['<Comp onClick={() => { const tag = 1; use(lbl, tag) }} />', 1],
    'no capture: still inlined': ['<Comp onClick={(t) => use(lbl, t)} />', 0],
  }
  for (const [label, [site, refs]] of Object.entries(CASES)) {
    for (const ssr of [false, true]) {
      it(`${label} (${ssr ? 'SSR' : 'client'})`, () => {
        const src = `export function C(props) {
  const tag = 't'
  const lbl = props.l + tag
  const b = lbl + '!'
  return ${site}
}`
        const js = transformJSX_JS(src, 'h.tsx', { ssr }).code
        const body = js.slice(js.indexOf('return'))
        const left = (body.match(/\b(lbl|b)\b/g) ?? []).length
        if (refs === 0) expect(left, js).toBe(0)
        else expect(left, js).toBeGreaterThan(0)
        // Never the captured form: `props.l + tag` under a `tag` binding.
        expect(body.includes('(tag) => use((props.l + tag)'), js).toBe(false)
        if (nativeTransform) expect(nativeTransform(src, 'h.tsx', ssr, null).code).toBe(js)
      })
    }
  }
})

describe('the documented counter keeps ONE signal', () => {
  it('`props.shared ?? signal(0)` is read through the const at every use', () => {
    const src = `import { signal } from '@pyreon/reactivity'
export default function Counter(props) {
  const count = props.shared ?? signal(0)
  return (
    <div>
      <button onClick={() => count.update((n) => n + 1)}>+</button>
      <span>{count()}</span>
    </div>
  )
}`
    const js = transformJSX_JS(src, 'counter.tsx').code
    // The initializer appears exactly once: in the declaration.
    expect(js.split('signal(0)').length - 1, js).toBe(1)
    expect(js).toContain('count.update(')
    expect(js).toContain('_bindText(count, ')
    if (nativeTransform) expect(nativeTransform(src, 'counter.tsx', false, null).code).toBe(js)
  })
})
