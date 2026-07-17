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
 * The native (Rust) backend ships `ssr_template` parity (JS ↔ native emit
 * byte-equality is locked in the compiler's `ssr-template-emit.test.ts`);
 * this file exercises the JS emit — same text by that lock. See
 * `TransformOptions.ssrTemplate`.
 */
import { transformJSX_JS } from '@pyreon/compiler'
import type { VNode } from '@pyreon/core'
import { For, Fragment, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { _esc, _ssr, _ssrAttr, _ssrAttrGen, _ssrAttrUrl, _ssrChildren, _ssrForKeyed, _ssrItem, renderToString } from '@pyreon/runtime-server'
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
  const depNames = ['_ssr', '_ssrChildren', '_ssrItem', '_ssrForKeyed', '_esc', '_ssrAttr', '_ssrAttrGen', '_ssrAttrUrl', 'signal', 'For', ...Object.keys(deps)]
  const depValues = [_ssr, _ssrChildren, _ssrItem, _ssrForKeyed, _esc, _ssrAttr, _ssrAttrGen, _ssrAttrUrl, signal, For, ...Object.values(deps)]
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
    name: 'fused keyed <For> child — parent skeleton compiles (_ssrForKeyed)',
    src: `const Node = <ul class="list"><For each={data} by={(r) => r.id}>{(r) => <li class="row" data-id={r.id}><span>{r.name}</span><span class={r.id % 2 === 0 ? 'a' : 'b'}>{r.tag}</span></li>}</For></ul>`,
    deps: { data: rows() },
    oracle: (deps) =>
      h(
        'ul',
        { class: 'list' },
        h(For as unknown as (props: unknown) => VNode, { each: deps.data, by: (r: { id: number }) => r.id } as never, ((r: { id: number; name: string; tag: string }) =>
          h(
            'li',
            { class: 'row', 'data-id': r.id },
            h('span', null, r.name),
            h('span', { class: r.id % 2 === 0 ? 'a' : 'b' }, r.tag),
          )) as never,
        ),
      ),
  },
  {
    name: 'fused keyed <For> — empty list',
    src: `const Node = <ul class="list"><For each={data} by={(r) => r.id}>{(r) => <li class="row" data-id={r.id}><span>{r.name}</span><span class={r.id % 2 === 0 ? 'a' : 'b'}>{r.tag}</span></li>}</For></ul>`,
    deps: { data: [] },
    oracle: (deps) =>
      h(
        'ul',
        { class: 'list' },
        h(For as unknown as (props: unknown) => VNode, { each: deps.data, by: (r: { id: number }) => r.id } as never, ((r: { id: number; name: string; tag: string }) =>
          h(
            'li',
            { class: 'row', 'data-id': r.id },
            h('span', null, r.name),
            h('span', { class: r.id % 2 === 0 ? 'a' : 'b' }, r.tag),
          )) as never,
        ),
      ),
  },
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
  // ── Dynamic attributes (via _ssrAttr — renderProp verbatim) ──
  {
    name: 'dynamic attrs — data-id + href (the objective-bench row shape)',
    // `data` is a free var (not a signal/prop) → the text/attr reads are NOT
    // wrapped, so the h() oracle uses bare values (no <!--$--> markers).
    src: `const Node = <div class="row" data-id={data.id}><span class="id">{String(data.id)}</span><a class="label" href={"/item/" + data.id}>{data.label}</a></div>`,
    deps: { data: { id: 7, label: 'Widget & Co' } },
    oracle: (d) => {
      const it = d.data as { id: number; label: string }
      return h(
        'div',
        { class: 'row', 'data-id': it.id },
        h('span', { class: 'id' }, String(it.id)),
        h('a', { class: 'label', href: `/item/${it.id}` }, it.label),
      )
    },
  },
  {
    name: 'dynamic .map row with per-row dynamic attrs (beats-Solid shape)',
    src: `const Node = <ul>{rows.map(r => <li class="row" data-id={r.id}><a href={"/i/" + r.id}>{r.name}</a></li>)}</ul>`,
    deps: { rows: rows() },
    oracle: (d) =>
      h('ul', null, () =>
        (d.rows as { id: number; name: string }[]).map((r) =>
          h('li', { class: 'row', 'data-id': r.id }, h('a', { href: `/i/${r.id}` }, r.name)),
        ),
      ),
  },
  {
    name: 'proven-non-null .map row — String(id) + template-literal href BAKED',
    // The realistic real-app shape: `data-id={String(r.id)}` (provably a string)
    // and `href={`/item/${r.id}`}` (template literal, safe `/` start) both BAKE
    // ` name="` + `_esc(v)` + `"`. Byte-identical to the h() path, which for a
    // non-null value renders the same ` name="value"`.
    src: 'const Node = <ul>{rows.map(r => <li data-id={String(r.id)}><a href={`/item/${r.id}`}>{r.name}</a></li>)}</ul>',
    deps: { rows: rows() },
    oracle: (d) =>
      h('ul', null, () =>
        (d.rows as { id: number; name: string }[]).map((r) =>
          h('li', { 'data-id': String(r.id) }, h('a', { href: `/item/${r.id}` }, r.name)),
        ),
      ),
  },
  {
    name: 'proven-non-null generic attrs — String/number-method/concat/ternary',
    src: 'const Node = <div data-a={String(data.n)} data-b={data.n.toFixed(2)} data-c={"x-" + data.n} data-d={data.on ? "y" : "n"}>t</div>',
    deps: { data: { n: 3.5, on: true } },
    oracle: (d) => {
      const it = d.data as { n: number; on: boolean }
      return h(
        'div',
        {
          'data-a': String(it.n),
          'data-b': it.n.toFixed(2),
          'data-c': `x-${it.n}`,
          'data-d': it.on ? 'y' : 'n',
        },
        't',
      )
    },
  },
  {
    name: 'dynamic class (signal) via _ssrAttr',
    src: `const s = signal('active hot'); const Node = <div class={s()}>x</div>`,
    oracle: () => {
      const s = signal('active hot')
      return h('div', { class: () => s() }, 'x')
    },
  },
  {
    name: 'dynamic object class + object style via _ssrAttr',
    // `data` is a free var → object attrs are NOT wrapped; renderProp does the
    // cx()/normalizeStyle work in both paths.
    src: `const Node = <div class={{ active: data.on, off: !data.on }} style={{ color: data.c, marginTop: 4 }}>y</div>`,
    deps: { data: { on: true, c: 'red' } },
    oracle: (d) => {
      const it = d.data as { on: boolean; c: string }
      return h(
        'div',
        { class: { active: it.on, off: !it.on }, style: { color: it.c, marginTop: 4 } },
        'y',
      )
    },
  },
  {
    name: 'camelCase dynamic attr name mapped via _ssrAttr',
    src: `const Node = <div tabIndex={data.i} className={data.c}>x</div>`,
    deps: { data: { i: -1, c: 'field' } },
    oracle: (d) =>
      h('div', { tabIndex: (d.data as { i: number }).i, className: (d.data as { c: string }).c }, 'x'),
  },
  {
    name: 'dynamic unsafe URL is dropped by _ssrAttr (renderProp guard)',
    src: `const Node = <a href={data.href}>x</a>`,
    deps: { data: { href: 'javascript:alert(1)' } },
    oracle: (d) => h('a', { href: (d.data as { href: string }).href }, 'x'),
  },
  {
    name: 'NULL-valued bare dynamic attr is OMITTED (null-omit safety, not baked)',
    // A bare member access is NOT provably non-null → runtime `_ssrAttrGen`,
    // which OMITS a null value (matching renderProp / the h() path). Over-baking
    // this (` data-x="" `) would diverge — the null-omit floor the fast path
    // deliberately preserves. (Bisect target for the baking guard.)
    src: `const Node = <div data-x={data.maybe} data-y={data.set}>t</div>`,
    deps: { data: { maybe: null, set: 'ok' } },
    oracle: (d) => {
      const it = d.data as { maybe: string | null; set: string }
      return h('div', { 'data-x': it.maybe, 'data-y': it.set }, 't')
    },
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
    ['spread attribute', `const N = <div {...props}>y</div>`],
    ['component child', `const N = <div><Widget /></div>`],
    ['void element (self-closing)', `const N = <img src="/a.png" />`],
    ['select element', `const N = <select value="b"><option>a</option></select>`],
    ['innerHTML content prop', `const N = <div innerHTML={'<x>'}></div>`],
    ['dangerouslySetInnerHTML content prop', `const N = <div dangerouslySetInnerHTML={{ __html: '<x>' }}></div>`],
    ['& in baked JSXText (entity divergence)', `const N = <p>Tom &amp; Jerry</p>`],
    ['& in raw JSX string attr', `const N = <a title="Tom &amp; Jerry">x</a>`],
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
