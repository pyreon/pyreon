/**
 * A bare known signal inside a FUNCTION nested in JSX is auto-called on every
 * element path — the rule, locked across the whole shape × path × mode matrix.
 *
 * The bug this locks: `onClick={() => count.set(count + 1)}` auto-called
 * `count` on `<button>x</button>` (a template element, whose emit slices the
 * handler) and left it bare on `<Button/>`, a childless `<div/>`, a
 * spread-carrying element and every SSR render (h() path, whose walk never
 * rewrote an identifier) — at runtime the signal was set to its own source
 * text plus "1". Both backends agreed, so the byte-equality gates could not
 * see it. This file therefore does NOT trust backend agreement: every emit is
 * parsed independently and every reference to `count` is classified from the
 * AST. Byte equality with the native backend is checked as well.
 *
 * Rule: inside JSX — at any function depth, on any element path — a bare
 * known signal in a value position is a read (`count` → `count()`). The
 * existing scope and identity rules apply unchanged: a shadowing parameter or
 * local is not the signal, `count.set` / `count.set(…)` act on the signal
 * object, the shorthand `{ count }` keeps the binding, assignment targets are
 * writes. To pass the signal ITSELF from a function, build the function
 * outside the JSX.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { rocketstyleCollapseKey, transformJSX_JS } from '../jsx'

/** napi `transformJsx(code, filename, ssr, known, reactivityLens?, collapse?, ssrTemplate?)`. */
type NativeTransform = (
  ...args: [string, string, boolean, string[] | null, boolean?, unknown?, boolean?]
) => { code: string }

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

// ─── The matrix ─────────────────────────────────────────────────────────────

/** Value shapes: every reference to `count` that is not `count.<method>` must be a call. */
const VALUE_SHAPES: Record<string, { attr?: string; child?: string }> = {
  'arrow handler': { attr: 'onClick={() => count.set(count + 1)}' },
  'function-expression handler': { attr: 'onClick={function () { count.set(count + 1) }}' },
  'async handler': { attr: 'onClick={async () => { await 0; count.set(count + 1) }}' },
  'two levels deep': { attr: 'onClick={() => [1].forEach(() => count.set(count + 1))}' },
  'ref callback': { attr: 'ref={(el) => { el.title = String(count) }}' },
  'function-valued prop': { attr: 'data-x={() => count + 1}' },
  'render-prop returning JSX': { attr: 'data-r={() => <i title={count + 1}>x</i>}' },
  'argument inside a handler': { attr: 'onClick={() => log(count)}' },
  'array element inside a handler': { attr: 'onClick={() => log([count, 1])}' },
  'return value of a handler': { attr: 'onClick={() => { return count }}' },
  'concise-body value': { attr: 'onClick={() => count}' },
  'function child': { child: '{() => count + 1}' },
  'IIFE child': { child: '{(() => count + 1)()}' },
  '.map callback child': { child: '{[1].map(() => count + 1)}' },
  'function child returning a handler': { child: '{() => <b onClick={() => count.set(count + 1)}>x</b>}' },
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
  `const count = signal(0)\nconst items = signal([1])\nconst ok = signal(true)\nexport const A = (rest) => ${jsx}`

function compileBoth(src: string, ssr: boolean, ssrTemplate: boolean): string {
  const js = transformJSX_JS(src, 'paths.tsx', { ssr, ssrTemplate }).code
  if (nativeTransform) {
    expect(nativeTransform(src, 'paths.tsx', ssr, null, false, undefined, ssrTemplate).code).toBe(js)
  }

  return js
}

// ─── Independent classification of the emitted source ──────────────────────

const SIGNAL_METHODS = new Set(['set', 'update', 'peek', 'trigger', 'subscribe', 'direct', 'debug', 'dispose'])
type N = { type: string; [k: string]: unknown }

type Refs = { called: number; bare: string[]; identity: number }
const NON_CHILD_KEYS = new Set(['type', 'start', 'end', 'loc', 'range'])

/** Classify ONE `count` identifier by its parent: call, identity use, or bare value read. */
function classifyRef(n: N, p: N, code: string, out: Refs): void {
  if (p.type === 'VariableDeclarator' && p.id === n) return
  if (p.type === 'MemberExpression' && p.property === n && !p.computed) return
  if (p.type === 'CallExpression' && p.callee === n) {
    out.called++

    return
  }
  const methodOfSignal =
    p.type === 'MemberExpression' &&
    p.object === n &&
    !p.computed &&
    SIGNAL_METHODS.has((p.property as N & { name: string }).name)
  // `count.set(…)` / `count.set` act on the signal object; `{ count }` keeps the binding.
  if (methodOfSignal || (p.type === 'Property' && p.shorthand)) out.identity++
  else out.bare.push(code.slice((n.start as number) - 20, (n.end as number) + 10))
}

/** Every reference to `count` in the emit, classified from the parsed AST. */
function classify(code: string): Refs {
  const parsed = parseSync('out.tsx', code)
  expect(parsed.errors, code).toEqual([])
  const out: Refs = { called: 0, bare: [], identity: 0 }
  const visit = (node: unknown, parent: N | null): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const n of node) visit(n, parent)

      return
    }
    const n = node as N
    if (typeof n.type !== 'string') return
    if (n.type === 'Identifier' && n.name === 'count' && parent) classifyRef(n, parent, code, out)
    for (const key of Object.keys(n)) if (!NON_CHILD_KEYS.has(key)) visit(n[key], n)
  }
  visit(parsed.program, null)

  return out
}

/** Does any handler / ref survive in the SSR string emit? (`_ssr` drops them.) */
const mentionsCount = (code: string) => /\bcount\b/.test(code.replace('const count = signal(0)', ''))

describe('bare signal in a function nested in JSX — every element path', () => {
  for (const mode of MODES) {
    describe(mode.label, () => {
      for (const [shape, { attr = '', child = '' }] of Object.entries(VALUE_SHAPES)) {
        for (const [path, build] of Object.entries(PATHS)) {
          it(`${shape} × ${path}`, () => {
            const code = compileBoth(source(build(attr, child)), mode.ssr, mode.ssrTemplate)
            const { called, bare } = classify(code)
            // The class this file locks: no value reference stays bare.
            expect(bare, code).toEqual([])
            // Not vacuous: the read is there and called — except where the
            // compile-to-string SSR emit drops a client-only handler/ref.
            if (mentionsCount(code)) expect(called, code).toBeGreaterThan(0)
            else expect(mode.ssrTemplate, code).toBe(true)
          })
        }
      }
    })
  }
})

describe('identity and scope rules hold on every path', () => {
  const pathsUnderTest = Object.entries(PATHS)
  for (const [path, build] of pathsUnderTest) {
    it(`shorthand { count } keeps the binding × ${path}`, () => {
      const code = compileBoth(source(build('onClick={() => use({ count })}', '')), false, false)
      expect(code).toContain('use({ count })')
    })
    it(`count.set by reference stays the method × ${path}`, () => {
      const code = compileBoth(source(build('onClick={() => count.set}', '')), false, false)
      expect(code).not.toContain('count().set')
    })
    it(`a shadowing parameter is not the signal × ${path}`, () => {
      const code = compileBoth(source(build('onClick={(count) => use(count + 1)}', '')), false, false)
      expect(code).toContain('use(count + 1)')
    })
    it(`a shadowing local is not the signal × ${path}`, () => {
      const code = compileBoth(
        source(build('onClick={() => { const count = 2; use(count + 1) }}', '')),
        false,
        false,
      )
      expect(code).toContain('use(count + 1)')
    })
    it(`an assignment target is a write, not a read × ${path}`, () => {
      // `count = 1` on a const is a user error, but it must never become `count() = 1`
      // (a syntax error); the auto-call leaves write targets alone on every path.
      const code = compileBoth(source(build('onClick={() => { count = 1 }}', '')), false, false)
      expect(code).not.toContain('count() =')
    })
  }

  it('a function built OUTSIDE the JSX passes the signal itself (the identity escape hatch)', () => {
    const code = compileBoth(
      `const count = signal(0)\nexport const A = () => { const bind = () => subscribe(count); return <Button onClick={bind} /> }`,
      false,
      false,
    )
    expect(code).toContain('subscribe(count)')
  })
})

describe('rocketstyle collapse re-emits peeled expressions with the same auto-call', () => {
  // The collapse path re-emits a site's `on*` handlers (and a dynamic prop's
  // ternary test) from source spans. A verbatim slice kept `count + 1` in the
  // handler and `() => (active) ? 0 : 1` in the dispatcher — always variant 0.
  const SITE = {
    templateHtml: '<button>Save</button>',
    lightClass: 'l',
    darkClass: 'd',
    rules: ['.l{}', '.d{}'],
    ruleKey: 'rk',
  }
  const MODE = { name: 'useMode', source: '@pyreon/ui-core' }
  function compileCollapse(src: string, sites: Record<string, typeof SITE>): string {
    const js = transformJSX_JS(src, 'collapse.tsx', {
      collapseRocketstyle: {
        candidates: new Set(['Button']),
        sites: new Map(Object.entries(sites)),
        mode: MODE,
      } as never,
    }).code
    expect(parseSync('collapse.tsx', js).errors, js).toEqual([])
    if (nativeTransform) {
      const napiCfg = { candidates: ['Button'], sites, mode: MODE }
      expect(
        (nativeTransform as unknown as (...a: unknown[]) => { code: string })(
          src,
          'collapse.tsx',
          false,
          null,
          false,
          napiCfg,
        ).code,
      ).toBe(js)
    }

    return js
  }

  it('on*-handler partial collapse (`__rsCollapseH`)', () => {
    const key = rocketstyleCollapseKey('Button', { state: 'primary' }, 'Save')
    const code = compileCollapse(
      `const count = signal(0)\nexport const C = () => <Button state="primary" onClick={() => count.set(count + 1)}>Save</Button>`,
      { [key]: SITE },
    )
    expect(code).toContain('__rsCollapseH(')
    expect(code).toContain('count.set(count() + 1)')
    expect(classify(code).bare).toEqual([])
  })

  it('dynamic-prop collapse (`__rsCollapseDynH`): the dispatcher reads the signal, the handler too', () => {
    const t = rocketstyleCollapseKey('Button', { state: 'primary' }, 'Save')
    const f = rocketstyleCollapseKey('Button', { state: 'secondary' }, 'Save')
    const code = compileCollapse(
      `const count = signal(0)\nconst active = signal(true)\nexport const C = () => <Button state={active ? "primary" : "secondary"} onClick={() => count.set(count + 1)}>Save</Button>`,
      { [t]: SITE, [f]: SITE },
    )
    expect(code).toContain('__rsCollapseDynH(')
    expect(code).toContain('() => (active()) ? 0 : 1')
    expect(code).toContain('count.set(count() + 1)')
  })
})
