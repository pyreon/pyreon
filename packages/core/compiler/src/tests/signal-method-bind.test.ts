/**
 * A signal's own method passed BY REFERENCE inside JSX is bound to its signal
 * (#4356): `ref={panel.set}` compiles to `ref={panel.set.bind(panel)}`.
 *
 * Signal methods live on one shared prototype and read `this`, so a detached
 * `panel.set` has no signal: the runtime calling it as a ref / handler / prop
 * callback threw. The compiler knows `panel` is a signal wherever the auto-call
 * pass reaches it (any function depth, any element path), so that pass binds
 * the reference instead of leaving it detached.
 *
 * The oracle is independent of backend agreement: every emitted output is
 * PARSED, and every `<signal>.<method>` member that is not a call must be the
 * callee object of `.bind(<the same signal>)`.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

type NativeTransform = (
  ...args: [code: string, filename: string, ssr: boolean, knownSignals: string[] | null]
) => { code: string; warnings: unknown[] }

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
  // native binary not built: the JS assertions still run
}

// `sel` (createSelector) is not in the list: its `subscribe` is an own
// closure, receiver-independent, so it stays as written.
const SIGNALS = ['el', 'value', 'count', 'dbl']
const METHODS = new Set([
  'set',
  'update',
  'peek',
  'trigger',
  'subscribe',
  'direct',
  'debug',
  'dispose',
])

const wrap = (jsx: string) => `import { signal, computed, createSelector } from '@pyreon/reactivity'
export function App(props) {
  const el = signal(null)
  const value = signal('')
  const count = signal(0)
  const dbl = computed(() => count() * 2)
  const sel = createSelector(() => count())
  const items = signal([1, 2])
  const { rest } = props
  return ${jsx}
}`

/** Every way a signal method leaves its receiver inside JSX. */
const SHAPES: Record<string, string> = {
  'ref, template element': '<div ref={el.set}>x</div>',
  'ref, spread element (h path)': '<div {...rest} ref={el.set}>x</div>',
  'ref, childless element': '<input ref={el.set} />',
  'ref, component': '<Comp ref={el.set} />',
  onInput: '<input onInput={value.set} />',
  'onClick update': '<button onClick={count.update}>x</button>',
  'onClick trigger': '<button onClick={count.trigger}>x</button>',
  'component callback prop': '<Comp onPick={el.set} onRead={dbl.peek} />',
  'optional chain': '<div ref={el?.set} onClick={count?.trigger}>x</div>',
  'type layers': '<div ref={(el.set as any)} onClick={count!.trigger}>x</div>',
  'parenthesised receiver': '<div ref={(el).set}>x</div>',
  'nested function': '<button onClick={() => [1].forEach(count.set)}>x</button>',
  'nested function, component': '<Comp onPick={() => [1].map(value.set)} />',
  'nested JSX in a ternary': '<div>{count() ? <i ref={el.set} /> : null}</div>',
  'map callback': '<ul>{items().map((i) => <li onClick={count.set}>{i}</li>)}</ul>',
  'render prop': '<Comp render={() => <b ref={el.set} />} />',
  'computed object': '<Comp a={dbl.peek} b={dbl.subscribe} />',
  'subscribe on a signal': '<Comp sub={count.subscribe} />',
}

const MODES = [
  { name: 'client', ssr: false },
  { name: 'ssr', ssr: true },
]

type Run = (src: string, ssr: boolean) => string
const BACKENDS: Array<[string, Run]> = [
  ['js', (src, ssr) => transformJSX_JS(src, 'c.tsx', { ssr }).code],
]

if (nativeTransform) {
  const nt = nativeTransform
  BACKENDS.push(['native', (src, ssr) => nt(src, 'c.tsx', ssr, null).code])
}

type Node = { type: string; [k: string]: unknown }

/** Detached `<signal>.<method>` references left in the emitted program. */
function detachedMethodRefs(code: string): string[] {
  const { program, errors } = parseSync('out.tsx', code)
  expect(errors, code).toEqual([])
  const found: string[] = []
  const unwrap = (n: Node): Node => {
    let cur = n
    while (
      [
        'ParenthesizedExpression',
        'TSAsExpression',
        'TSNonNullExpression',
        'TSSatisfiesExpression',
      ].includes(cur.type)
    )
      cur = cur.expression as Node
    return cur
  }
  const visit = (n: unknown, parent: Node | null): void => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) {
      for (const x of n) visit(x, parent)
      return
    }
    const node = n as Node
    if (node.type === 'MemberExpression' && !node.computed) {
      const obj = unwrap(node.object as Node)
      const prop = node.property as Node
      if (
        obj.type === 'Identifier' &&
        SIGNALS.includes(obj.name as string) &&
        METHODS.has(prop.name as string)
      ) {
        const called = parent?.type === 'CallExpression' && parent.callee === node
        // `sig.set.bind(sig)`: this member is the object of a `.bind` member
        // that is itself called with the same signal.
        const bound =
          parent?.type === 'MemberExpression' &&
          (parent.property as Node).name === 'bind' &&
          parent.object === node
        if (!called && !bound) found.push(`${obj.name as string}.${prop.name as string}`)
      }
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === 'parent') continue
      if (v && typeof v === 'object') visit(v, node)
    }
  }
  visit(program, null)
  return found
}

describe('a signal method passed by reference in JSX is bound to its signal (#4356)', () => {
  for (const [backend, run] of BACKENDS) {
    for (const m of MODES) {
      for (const [name, jsx] of Object.entries(SHAPES)) {
        it(`${backend} · ${m.name} · ${name}`, () => {
          const out = run(wrap(jsx), m.ssr)
          expect(detachedMethodRefs(out), out).toEqual([])
          expect(out).toMatch(/\.(set|update|trigger|peek|subscribe)\.bind\((el|value|count|dbl)\)/)
        })
      }
    }
  }

  for (const [backend, run] of BACKENDS) {
    it(`${backend}: the exact emit for the issue's shape`, () => {
      const out = run(wrap('<div ref={el.set} onClick={el.set}>x</div>'), false)
      expect(out).toContain('const __r = el.set.bind(el);')
      expect(out).toContain('__root.__ev_click = el.set.bind(el);')
    })

    it(`${backend}: a selector's own-closure subscribe is left as written`, () => {
      const out = run(wrap('<Comp b={sel.subscribe} />'), false)
      expect(out).toContain('b={sel.subscribe}')
    })

    it(`${backend}: what the compiler cannot prove is a signal stays as written`, () => {
      // `props.sig` / a shadowing callback parameter: no signal is known, so
      // the member is left alone (the runtime names the mistake in dev).
      const out = run(
        wrap('<div><b ref={props.sig.set} /><ul>{[1].map((el) => <li ref={el.set} />)}</ul></div>'),
        false,
      )
      expect(out).toContain('props.sig.set')
      expect(out).not.toContain('props.sig.set.bind')
      expect(out).toContain('<li ref={el.set} />')
    })

    it(`${backend}: a non-method member still reads the value, a called method is untouched`, () => {
      const out = run(
        wrap('<p title={el.name} onClick={() => count.set(count() + 1)}>{value.length}</p>'),
        false,
      )
      expect(out).toContain('el().name')
      expect(out).toContain('count.set(count() + 1)')
      expect(out).not.toContain('.bind(')
    })

    it(`${backend}: no signal-method-reference warning is emitted any more`, () => {
      const r =
        nativeTransform && backend === 'native'
          ? nativeTransform(wrap('<div ref={el.set}>x</div>'), 'c.tsx', false, null)
          : transformJSX_JS(wrap('<div ref={el.set}>x</div>'), 'c.tsx')
      expect(JSON.stringify(r.warnings)).not.toContain('signal-method-reference')
    })
  }
})

describe.skipIf(!nativeTransform)('native emit equals JS for every shape', () => {
  for (const m of MODES) {
    for (const [name, jsx] of Object.entries(SHAPES)) {
      it(`${m.name} · ${name}`, () => {
        expect(BACKENDS[1]![1](wrap(jsx), m.ssr)).toBe(BACKENDS[0]![1](wrap(jsx), m.ssr))
      })
    }
  }
})
