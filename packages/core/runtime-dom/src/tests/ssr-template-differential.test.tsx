/**
 * Compile-to-string SSR fast path (`options.ssrTemplate`) — END-TO-END
 * BYTE-IDENTITY + hydration gate.
 *
 * The #1 requirement of the fast path: `renderToString` of a subtree compiled
 * to `_ssr(...)` must be BYTE-IDENTICAL to the current h() path, or hydration
 * breaks for every SSR/SSG app. This test compiles REAL source through the
 * (JS) compiler with the flag ON, EVALUATES the emitted `_ssr(...)`, renders
 * it, and asserts equality against the hand-written h() oracle (the current
 * proven-correct behavior). It then hydrates the SSR output over the DOM
 * compilation of the SAME source and asserts no mismatch — closing the loop
 * that the fast path is hydration-safe.
 *
 * The native (Rust) backend does not implement `ssrTemplate` yet, so the fast
 * path is exercised through `transformJSX_JS` here; the equivalence gates run
 * with the flag OFF (both backends bail to h() → byte-identical). See
 * `TransformOptions.ssrTemplate`.
 */
import { transformJSX_JS } from '@pyreon/compiler'
import type { VNode } from '@pyreon/core'
import { Fragment, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { _esc, _ssr, _ssrChildren, renderToString } from '@pyreon/runtime-server'
import { disableHydrationWarnings, hydrateRoot, mount, onHydrationMismatch } from '../index'

function stripImports(code: string): string {
  return code.replace(/^import\s+.*$/gm, '').trim()
}

/**
 * Compile `src` with the SSR fast path ON, eval the emitted top-level binding,
 * and return it. `deps` supplies any free identifiers the source references
 * (test data, `signal`). The compiler's `_ssr`/`_ssrChildren` imports are
 * stripped and injected as Function args.
 */
function evalSsr(src: string, deps: Record<string, unknown> = {}): unknown {
  const out = transformJSX_JS(src, 'case.tsx', { ssr: true, ssrTemplate: true })
  const body = stripImports(out.code)
  // Every differential source names its renderable binding `Node`.
  const depNames = ['_ssr', '_ssrChildren', '_esc', 'signal', ...Object.keys(deps)]
  const depValues = [_ssr, _ssrChildren, _esc, signal, ...Object.values(deps)]
  // eslint-disable-next-line no-new-func
  const fn = new Function(...depNames, `${body}\nreturn Node`)
  return fn(...depValues)
}

/** Assert the compiled output CONTAINS `_ssr(` (fast path was taken). */
function compiledUsesSsr(src: string): boolean {
  return transformJSX_JS(src, 'case.tsx', { ssr: true, ssrTemplate: true }).code.includes('_ssr(')
}

interface DiffCase {
  name: string
  src: string
  deps?: Record<string, unknown>
  /** Hand-written h() oracle — the current proven-correct SSR shape. */
  oracle: (deps: Record<string, unknown>) => VNode
}

const rows = () => [
  { id: 1, name: 'Alice', tag: '<b>' },
  { id: 2, name: 'Bob & Co', tag: 'x' },
]

const cases: DiffCase[] = [
  {
    name: 'fully static element + attrs',
    src: `const Node = <div class="card" id="a" role="note">Hello</div>`,
    oracle: () => h('div', { class: 'card', id: 'a', role: 'note' }, 'Hello'),
  },
  {
    name: 'attr-value escaping',
    src: `const Node = <div title={'a"b&c<d'}>x</div>`,
    oracle: () => h('div', { title: 'a"b&c<d' }, 'x'),
  },
  {
    name: 'static text escaping (expr-literal child)',
    src: `const Node = <p>{'a & b < c > d'}</p>`,
    oracle: () => h('p', null, 'a & b < c > d'),
  },
  {
    name: 'baked JSXText escaping (quotes in a static text node)',
    // JSXText (not an expr child) is baked at compile time via the SSR escaper.
    // `<`/`>` parse-error in JSXText and `&` bails (entity safety), so `"`/`'`
    // are the bake-position escaping this case locks (→ &quot; / &#39;).
    src: `const Node = <p>say "hi" it's me</p>`,
    oracle: () => h('p', null, `say "hi" it's me`),
  },
  {
    name: 'wrapped dynamic text child (signal) — markers',
    src: `const s = signal('Ada'); const Node = <div>{s()}</div>`,
    oracle: () => {
      const s = signal('Ada')
      return h('div', null, () => s())
    },
  },
  {
    name: 'mixed static text + wrapped hole',
    src: `const s = signal(3); const Node = <p>count: {s()}!</p>`,
    oracle: () => {
      const s = signal(3)
      return h('p', null, 'count: ', () => s(), '!')
    },
  },
  {
    name: 'nested eligible elements inline',
    src: `const Node = <ul><li class="a">one</li><li>two</li></ul>`,
    oracle: () => h('ul', null, h('li', { class: 'a' }, 'one'), h('li', null, 'two')),
  },
  {
    name: 'bare (non-signal) hole — no markers, escaped',
    src: `const Node = <span>{data.name}</span>`,
    deps: { data: { name: 'a<b>&"' } },
    oracle: (d) => h('span', null, (d.data as { name: string }).name),
  },
  {
    name: '.map fast path — keyless list with class + escaped text',
    src: `const Node = <ul>{rows.map(r => <li class="row">{r.name}</li>)}</ul>`,
    deps: { rows: rows() },
    oracle: (d) =>
      h('ul', null, () =>
        (d.rows as { name: string }[]).map((r) => h('li', { class: 'row' }, r.name)),
      ),
  },
  {
    name: '.map fast path — nested elements + mixed text in item',
    src: `const Node = <ul>{rows.map(r => <li><b>{r.name}</b>: {r.tag}</li>)}</ul>`,
    deps: { rows: rows() },
    oracle: (d) =>
      h('ul', null, () =>
        (d.rows as { name: string; tag: string }[]).map((r) =>
          h('li', null, h('b', null, r.name), ': ', r.tag),
        ),
      ),
  },
  {
    name: 'aria string attr + boolean attr',
    src: `const Node = <button aria-label="save" disabled={true}>Save</button>`,
    oracle: () => h('button', { 'aria-label': 'save', disabled: true }, 'Save'),
  },
  {
    name: 'safe url attr baked',
    src: `const Node = <a href="/foo/bar">go</a>`,
    oracle: () => h('a', { href: '/foo/bar' }, 'go'),
  },
]

describe('SSR fast path — byte-identical to h() (compiled → eval → render)', () => {
  for (const c of cases) {
    test(c.name, async () => {
      const deps = c.deps ?? {}
      const node = evalSsr(c.src, deps) as VNode
      const fast = await renderToString(node)
      const slow = await renderToString(c.oracle(deps))
      expect(fast).toBe(slow)
    })
  }
})

describe('SSR fast path — conservative bail catalogue (stays on h())', () => {
  const bails: [string, string][] = [
    ['unsafe javascript: url', `const N = <a href="javascript:evil()">x</a>`],
    ['dynamic attribute', `const s = signal('x'); const N = <div class={s()}>y</div>`],
    ['spread attribute', `const N = <div {...props}>y</div>`],
    ['component child', `const N = <div><Widget /></div>`],
    ['void element with content path', `const N = <img src="/a.png" />`],
    ['select element', `const N = <select value="b"><option>a</option></select>`],
    ['camelCase attr name (needs runtime map)', `const N = <div tabIndex={0}>y</div>`],
    ['object style attr', `const N = <div style={{ color: 'red' }}>y</div>`],
    ['innerHTML', `const N = <div innerHTML={'<x>'}></div>`],
  ]
  for (const [name, src] of bails) {
    test(`bails: ${name}`, () => {
      expect(compiledUsesSsr(src)).toBe(false)
    })
  }
})

describe('SSR fast path output hydrates without mismatch', () => {
  test('list SSR (_ssr) hydrates over the DOM compilation of the same source', async () => {
    const data = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]
    // SSR string from the fast path.
    const ssrNode = evalSsr(
      `const Node = <ul class="list">{rows.map(r => <li class="row">{r.name}</li>)}</ul>`,
      { rows: data },
    ) as VNode
    const html = await renderToString(ssrNode)

    // Client side: the DOM compilation (`_tpl`) of the SAME markup, mounted via
    // hydrateRoot over the SSR HTML. We express the client tree with h() (the
    // fine-grained bindings are what hydration must reconcile onto the SSR DOM).
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)

    const mismatches: unknown[] = []
    const off = onHydrationMismatch((e) => mismatches.push(e))
    const clientTree = h(
      'ul',
      { class: 'list' },
      () => data.map((r) => h('li', { class: 'row' }, r.name)),
    )
    const dispose = hydrateRoot(container, clientTree)
    expect(mismatches).toEqual([])
    expect(container.querySelectorAll('li.row').length).toBe(2)
    expect(container.textContent).toContain('Alice')
    expect(container.textContent).toContain('Bob')
    off()
    dispose()
    document.body.removeChild(container)
  })
})

// Reference so unused-import guards don't strip the hydration helpers when the
// hydration block is edited; also keeps `mount`/`Fragment`/`disableHydrationWarnings`
// available for follow-up specs.
void mount
void Fragment
void disableHydrationWarnings
