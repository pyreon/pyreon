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
import { transformSync } from 'esbuild'
import { transformJSX_JS } from '@pyreon/compiler'
import type { VNode } from '@pyreon/core'
import { For, Fragment, _lc, createContext, h, provide, useContext } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { _esc, _escSole, _ssr, _ssrAttr, _ssrAttrGen, _ssrAttrUrl, _ssrChildren, _ssrForKeyed, _ssrDeferred, _ssrItem, _ssrNode, renderToString } from '@pyreon/runtime-server'
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
  // MIRROR THE REAL PIPELINE: Pyreon's compiler does not lower JSX itself — it
  // rewrites expressions and leaves the JSX for the downstream transform. That
  // is invisible for statics-only emits (nothing survives), but a COMPONENT
  // child is PRESERVED as JSX inside the `_ssrNode(...)` hole on purpose, so
  // the emitted code is JS-with-JSX and `new Function` cannot parse it
  // (`SyntaxError: Unexpected token '<'`). Running esbuild here is not a
  // workaround for the feature — it is the step a real build already performs
  // between the compiler and the runtime.
  const lowered = transformSync(stripImports(out.code), {
    loader: 'jsx',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  // Every differential source names its renderable binding `Node`.
  const depNames = ['_ssr', '_ssrChildren', '_ssrItem', '_ssrForKeyed', '_esc', '_escSole', '_lc', '_ssrAttr', '_ssrAttrGen', '_ssrAttrUrl', '_ssrNode', '_ssrDeferred', 'signal', 'For', 'h', 'Fragment', ...Object.keys(deps)]
  const depValues = [_ssr, _ssrChildren, _ssrItem, _ssrForKeyed, _esc, _escSole, _lc, _ssrAttr, _ssrAttrGen, _ssrAttrUrl, _ssrNode, _ssrDeferred, signal, For, h, Fragment, ...Object.values(deps)]
  // eslint-disable-next-line no-new-func
  const fn = new Function(...depNames, `${lowered}\nreturn Node`)
  return fn(...depValues)
}

/** Assert the compiled output CONTAINS `_ssr(` (fast path was taken). */
function compiledUsesSsr(src: string): boolean {
  return transformJSX_JS(src, 'case.tsx', { ssr: true, ssrTemplate: true }).code.includes('_ssr(')
}

/**
 * Assert the ROOT binding itself compiled to `_ssr(...)`.
 *
 * A substring check for `_ssr(` is NOT sufficient to prove the root took the
 * fast path: when a child bails, the bail propagates up and the root stays raw
 * JSX (h() path) while a void-free SIBLING subtree is still salvaged into its
 * own `_ssr(...)`. `includes('_ssr(')` therefore returns true for a tree that
 * mostly did NOT take the fast path — a false positive that makes an
 * eligibility test pass against the broken state.
 */
function compiledRootUsesSsr(src: string): boolean {
  const { code } = transformJSX_JS(src, 'case.tsx', { ssr: true, ssrTemplate: true })
  // A subtree holding a COMPONENT child is emitted as `_ssrDeferred(() => _ssr(…))`
  // so the render lands at the h() path's timing (see `DeferredHtml`); both
  // spellings mean "the root took the fast path".
  return /const N\s*=\s*(?:_ssrDeferred\(\(\)\s*=>\s*)?_ssr\(/.test(code)
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
    // The fused row body concats statics + temps inline and only reaches
    // `_ssrItem` when a `typeof _hN === "string"` guard FAILS. An async child
    // makes `_esc` return a Promise, so this is the case that exercises that
    // fallback — and with it the async promotion path — end to end. Without a
    // case like this the fallback branch is emitted but never executed, and a
    // byte divergence there would ship unseen.
    name: 'fused keyed <For> — ASYNC child in a row falls back to _ssrItem (guard fails)',
    src: `const Node = <ul class="list"><For each={data} by={(r) => r.id}>{(r) => <li class="row" data-id={r.id}><span>{r.name}</span><span>{Async(r)}</span></li>}</For></ul>`,
    deps: {
      data: rows(),
      // An async component: renderNode promotes it, so `_esc` returns a Promise
      // — which is what makes the row's `typeof _hN === "string"` guard fail.
      // (`h`'s overloads don't model an async ComponentFn; the repo's standard
      // cast idiom for that is used elsewhere in this file for `For`.)
      Async: (r: { name: string }) =>
        h(
          (async () => h('em', null, `async:${r.name}`)) as unknown as (p: unknown) => VNode,
          null,
        ),
    },
    oracle: (deps) => {
      const Async = deps.Async as (r: { name: string }) => VNode
      return h(
        'ul',
        { class: 'list' },
        h(
          For as unknown as (props: unknown) => VNode,
          { each: deps.data, by: (r: { id: number }) => r.id } as never,
          ((r: { id: number; name: string; tag: string }) =>
            h(
              'li',
              { class: 'row', 'data-id': r.id },
              h('span', null, r.name),
              // Accessor, not a bare value: `Async(r)` is a non-pure call, so
              // the real compile wraps it — which is what makes renderNode emit
              // the <!--$-->…<!--/$--> markers the fast path bakes into statics.
              h('span', null, () => Async(r)),
            )) as never,
        ),
      )
    },
  },
  {
    // A nested `.map` inside a row emits `_ssrChildren`, whose result is a
    // RawHtml — NOT a string — so the guard rejects it and the row takes the
    // fallback. Pins that a RawHtml hole is concatenated by `.value` (not
    // stringified to "[object Object]") through the fused path's fallback.
    name: 'fused keyed <For> — nested .map (RawHtml hole) falls back to _ssrItem',
    src: `const Node = <ul class="list"><For each={data} by={(r) => r.id}>{(r) => <li data-id={r.id}><span>{r.name}</span><b>{r.name.split(' ').map((w) => <i>{w}</i>)}</b></li>}</For></ul>`,
    deps: { data: rows() },
    oracle: (deps) =>
      h(
        'ul',
        { class: 'list' },
        h(
          For as unknown as (props: unknown) => VNode,
          { each: deps.data, by: (r: { id: number }) => r.id } as never,
          ((r: { id: number; name: string }) =>
            h(
              'li',
              { 'data-id': r.id },
              h('span', null, r.name),
              // Accessor for the same reason as above (see the canonical `.map`
              // oracle shape further down this file).
              h('b', null, () => r.name.split(' ').map((w: string) => h('i', null, w))),
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
  {
    // The exact shape that used to sink a whole component: a realistic card
    // whose media slot holds an `<img/>`. Pre-fix the root <article> and the
    // img branch stayed raw JSX (h() path) and only the void-free sibling
    // <div class="body"> was salvaged into its own _ssr(...).
    name: 'nested void element — realistic card with <img/> (was a propagating bail)',
    src: `const Node = <article class="card"><div class="media"><img src={src} alt={title} /></div><div class="body"><h3 class="t">{title}</h3></div></article>`,
    deps: { src: '/img/a.png', title: 'Tom & Jerry' },
    oracle: (deps) => {
      const src = deps.src as string
      const title = deps.title as string
      return h(
        'article',
        { class: 'card' },
        h('div', { class: 'media' }, h('img', { src, alt: title })),
        h('div', { class: 'body' }, h('h3', { class: 't' }, title)),
      )
    },
  },
  {
    // Void close is ` />` in the runtime — the SPACE must survive into the
    // baked statics, and an entity-bearing attr must escape identically.
    name: 'several void siblings — <img/> <br/> <input/> close as " />"',
    src: `const Node = <div class="w"><img src={src} /><br /><input name="q" value={title} /></div>`,
    deps: { src: '/a&b.png', title: 'a<b' },
    oracle: (deps) => {
      const src = deps.src as string
      const title = deps.title as string
      return h('div', { class: 'w' }, h('img', { src }), h('br', null), h('input', { name: 'q', value: title }))
    },
  },
  {
    name: 'self-closing non-void <div/> renders as <div></div>',
    src: `const Node = <div class="w"><div /><span>{title}</span></div>`,
    deps: { title: 'x' },
    oracle: (deps) => h('div', { class: 'w' }, h('div', null), h('span', null, deps.title as string)),
  },
  // ── ROOT-level self-closing (the residual hole #2515 left open) ───────────
  {
    name: 'ROOT void <img/> (an <Icon>/<Avatar> component body)',
    src: `const Node = <img src={src} alt={alt} />`,
    deps: { src: '/a&b.png', alt: 'a<b' },
    oracle: (deps) => h('img', { src: deps.src as string, alt: deps.alt as string }),
  },
  {
    name: 'ROOT void <hr/> (a <Divider> component body)',
    src: `const Node = <hr class="sep" />`,
    oracle: () => h('hr', { class: 'sep' }),
  },
  {
    name: 'ROOT void <input/> (an <Input> component body)',
    src: `const Node = <input type="text" name="q" value={v} />`,
    deps: { v: 'a<b&c' },
    oracle: (deps) => h('input', { type: 'text', name: 'q', value: deps.v as string }),
  },
  {
    name: 'ROOT non-void self-closing <div/> renders as <div></div>',
    src: `const Node = <div class={cls} />`,
    deps: { cls: 'box' },
    oracle: (deps) => h('div', { class: deps.cls as string }),
  },
  // ── COMPONENT CHILDREN as preserved-source holes ─────────────────────────
  // The bytes are the whole point: a SYNC component child inlines with NO
  // markers, an ASYNC one is bracketed by `<!--$pas-->`/`<!--$pae-->`. Both
  // come from `renderComponent` via `_ssrNode`, so identity should hold BY
  // CONSTRUCTION — these assert it actually does.
  {
    // The statics escape `</script` so an inlined chunk can't end an HTML
    // <script> element early. `"<\\/script>"` === `"</script>"` in JS, so the
    // RENDERED bytes must be unchanged — that is what this case proves.
    name: 'a <script> element renders identically despite statics sanitization',
    src: `const Node = <div class="d"><script>{code}</script></div>`,
    deps: { code: 'var a = 1' },
    oracle: (deps) => h('div', { class: 'd' }, h('script', null, deps.code as string)),
  },
  {
    name: 'wrapper whose ONLY child is a component',
    src: `const Node = <main class="m"><Widget /></main>`,
    deps: { Widget: () => h('section', { class: 'w' }, 'x') },
    oracle: (deps) => h('main', { class: 'm' }, h(deps.Widget as never, null)),
  },
  {
    name: 'component child with a dynamic prop',
    src: `const Node = <main class="m"><Widget id={id} /></main>`,
    deps: { Widget: (p: { id: number }) => h('span', null, String(p.id)), id: 7 },
    oracle: (deps) => h('main', { class: 'm' }, h(deps.Widget as never, { id: deps.id })),
  },
  {
    name: 'static + component + static siblings',
    src: `const Node = <div class="s"><header>H</header><Widget /><footer>F</footer></div>`,
    deps: { Widget: () => h('b', null, 'w') },
    oracle: (deps) =>
      h(
        'div',
        { class: 's' },
        h('header', null, 'H'),
        h(deps.Widget as never, null),
        h('footer', null, 'F'),
      ),
  },
  {
    name: 'TWO component children (multi-hole bracketing)',
    src: `const Node = <div><A /><B /></div>`,
    deps: { A: () => h('i', null, 'a'), B: () => h('u', null, 'b') },
    oracle: (deps) => h('div', null, h(deps.A as never, null), h(deps.B as never, null)),
  },
  {
    name: 'component child adjacent to a text hole',
    src: `const Node = <div><Widget />{t}</div>`,
    deps: { Widget: () => h('i', null, 'w'), t: 'a<b' },
    oracle: (deps) => h('div', null, h(deps.Widget as never, null), deps.t as string),
  },
  {
    name: 'component child that receives children',
    src: `const Node = <main><Widget>inner</Widget></main>`,
    deps: { Widget: (p: { children?: unknown }) => h('p', null, p.children as never) },
    oracle: (deps) => h('main', null, h(deps.Widget as never, null, 'inner')),
  },
  {
    name: 'ASYNC component child keeps its $pas/$pae hydration sentinels',
    src: `const Node = <main><Slow /></main>`,
    deps: { Slow: async () => h('em', null, 'late') },
    oracle: (deps) => h('main', null, h(deps.Slow as never, null)),
  },
  {
    name: 'a provider component does not leak its context frame to later siblings',
    src: `const Node = <div><Prov /><After /></div>`,
    deps: {
      Prov: () => h('span', null, 'p'),
      After: () => h('span', null, 'a'),
    },
    oracle: (deps) => h('div', null, h(deps.Prov as never, null), h(deps.After as never, null)),
  },
  // ── Conditional DOM-element lowering (`cond && <el>` / `cond ? <el> : …`) ──
  // The TAKEN branch builds a string via `_ssr` instead of allocating a VNode +
  // walking `renderNode`. Byte-identity must hold for BOTH branch values, so
  // every shape is tested `true` AND `false`. A SOLE conditional child elides
  // markers (`_escSole`), so its oracle uses the eager value form; a NON-sole
  // one is wrapped by the h() path → `<!--$-->…<!--/$-->`, so its oracle uses
  // the accessor form (same convention as the async-<For> case above). A
  // component-branch or non-element operand stays on h() (bail catalogue).
  {
    name: 'cond && <el> sole — taken',
    src: `const Node = <div>{on && <span class="badge">{x}</span>}</div>`,
    deps: { on: true, x: 5 },
    oracle: (d) => h('div', null, (d.on as boolean) && h('span', { class: 'badge' }, d.x as number)),
  },
  {
    name: 'cond && <el> sole — not taken',
    src: `const Node = <div>{on && <span class="badge">{x}</span>}</div>`,
    deps: { on: false, x: 5 },
    oracle: (d) => h('div', null, (d.on as boolean) && h('span', { class: 'badge' }, d.x as number)),
  },
  {
    name: 'cond ? <el> : null — taken',
    src: `const Node = <div>{on ? <span>{x}</span> : null}</div>`,
    deps: { on: true, x: 'hi & <ok>' },
    oracle: (d) => h('div', null, (d.on as boolean) ? h('span', null, d.x as string) : null),
  },
  {
    name: 'cond ? <el> : null — not taken',
    src: `const Node = <div>{on ? <span>{x}</span> : null}</div>`,
    deps: { on: false, x: 'hi & <ok>' },
    oracle: (d) => h('div', null, (d.on as boolean) ? h('span', null, d.x as string) : null),
  },
  {
    name: 'cond ? <a> : <b> — consequent',
    src: `const Node = <div>{on ? <b>{x}</b> : <i>{y}</i>}</div>`,
    deps: { on: true, x: 1, y: 2 },
    oracle: (d) => h('div', null, (d.on as boolean) ? h('b', null, d.x as number) : h('i', null, d.y as number)),
  },
  {
    name: 'cond ? <a> : <b> — alternate',
    src: `const Node = <div>{on ? <b>{x}</b> : <i>{y}</i>}</div>`,
    deps: { on: false, x: 1, y: 2 },
    oracle: (d) => h('div', null, (d.on as boolean) ? h('b', null, d.x as number) : h('i', null, d.y as number)),
  },
  {
    // NON-sole but PLAIN vars: `shouldWrap` is false (no signal read), so the h()
    // path emits an EAGER value child — no `<!--$-->` markers. The fast path
    // matches (`_esc(on && _ssr(...))`, markers NOT baked). Oracle is eager.
    name: 'cond && <el> non-sole, plain vars (no markers) — taken',
    src: `const Node = <div><h1>t</h1>{on && <span>{x}</span>}</div>`,
    deps: { on: true, x: 'z' },
    oracle: (d) => h('div', null, h('h1', null, 't'), (d.on as boolean) && h('span', null, d.x as string)),
  },
  {
    name: 'cond && <el> non-sole, plain vars (no markers) — not taken',
    src: `const Node = <div><h1>t</h1>{on && <span>{x}</span>}</div>`,
    deps: { on: false, x: 'z' },
    oracle: (d) => h('div', null, h('h1', null, 't'), (d.on as boolean) && h('span', null, d.x as string)),
  },
  {
    // NON-sole with a SIGNAL read: `shouldWrap` is true, so the h() path wraps
    // the child in an accessor → `<!--$-->…<!--/$-->`. The fast path bakes the
    // SAME markers into the statics AND lowers the element — this is the case
    // that exercises the marker interaction with the lowering. Oracle uses the
    // accessor form so `renderNode` emits the markers (async-<For> convention).
    name: 'cond && <el> non-sole, signal (markers) — taken',
    src: `const Node = <div><h1>t</h1>{count() > 0 && <span>{count()}</span>}</div>`,
    deps: { count: signal(3) },
    oracle: (d) => {
      const count = d.count as () => number
      return h('div', null, h('h1', null, 't'), () => count() > 0 && h('span', null, count()))
    },
  },
  {
    name: 'cond && <el> non-sole, signal (markers) — not taken',
    src: `const Node = <div><h1>t</h1>{count() > 0 && <span>{count()}</span>}</div>`,
    deps: { count: signal(0) },
    oracle: (d) => {
      const count = d.count as () => number
      return h('div', null, h('h1', null, 't'), () => count() > 0 && h('span', null, count()))
    },
  },
  {
    name: 'nested conditional element lowering — inner taken',
    src: `const Node = <div>{on && <span class="w">{q ? <b>{x}</b> : null}</span>}</div>`,
    deps: { on: true, q: true, x: 'deep' },
    oracle: (d) =>
      h('div', null, (d.on as boolean) && h('span', { class: 'w' }, (d.q as boolean) ? h('b', null, d.x as string) : null)),
  },
  {
    name: 'nested conditional element lowering — inner not taken',
    src: `const Node = <div>{on && <span class="w">{q ? <b>{x}</b> : null}</span>}</div>`,
    deps: { on: true, q: false, x: 'deep' },
    oracle: (d) =>
      h('div', null, (d.on as boolean) && h('span', { class: 'w' }, (d.q as boolean) ? h('b', null, d.x as string) : null)),
  },
]

/**
 * A FUNCTION-valued attribute (a bare identifier holding an accessor —
 * `d={geometry}` where `geometry` came from a prop, a `const`, or a helper).
 *
 * The compiler picks the lean `_ssrAttrGen` / `_ssrAttrUrl` from the attribute
 * NAME alone, but whether `renderProp` resolves depends on the VALUE'S TYPE —
 * so a name-based selection can never rule the function branch out. Both lean
 * helpers documented themselves as "byte-identical to renderProp" while
 * omitting it, and `String(fn)` wrote the closure SOURCE into the attribute
 * (`d="() =&gt; geometry()?.path ?? &quot;&quot;"`). Visible in the SSR HTML,
 * and a guaranteed hydration mismatch, since the client's `applyAttrProp`
 * resolves. `_ssrAttr` (class/style/aria/camelCase → renderProp verbatim) was
 * never affected, which is why the shape hid: the common attrs were fine and
 * only the lean subset — `d`, `id`, `title`, `role`, `data-*`, `href`, `src` —
 * broke.
 */
describe('SSR fast path — accessor-valued attributes resolve (not stringified)', () => {
  const accessorCases: [string, string, Record<string, unknown>][] = [
    // Lean generic helper (`_ssrAttrGen`) — the reported shape.
    ['generic (d)', `const Node = <path d={g} />`, { g: () => 'M0 0 L1 1' }],
    ['generic (title)', `const Node = <span title={g} />`, { g: () => 'hi' }],
    ['generic (data-*)', `const Node = <div data-x={g} />`, { g: () => 'v' }],
    // Lean URL helper (`_ssrAttrUrl`) — resolution must run BEFORE the
    // url-guard, which only inspects strings.
    ['url (href)', `const Node = <a href={g} />`, { g: () => '/x' }],
    ['url (src)', `const Node = <img src={g} />`, { g: () => '/a.png' }],
    // An accessor returning an UNSAFE url must still be stripped: resolving
    // after the guard would have let it through as a stringified function.
    ['url (href) — accessor returning javascript:', `const Node = <a href={g} />`, { g: () => 'javascript:alert(1)' }],
    // Absent/boolean results keep renderProp's omit + presence semantics.
    ['generic — accessor returning undefined omits', `const Node = <div title={g} />`, { g: () => undefined }],
    ['generic — accessor returning false omits', `const Node = <div hidden={g} />`, { g: () => false }],
    ['generic — accessor returning true is bare', `const Node = <div hidden={g} />`, { g: () => true }],
    // `_ssrAttr` (renderProp verbatim) was already correct — locked so the
    // three helpers can never drift apart again.
    ['class (already correct)', `const Node = <div class={g} />`, { g: () => ['a', 'b'] }],
    ['style (already correct)', `const Node = <div style={g} />`, { g: () => ({ color: 'red' }) }],
    ['aria (already correct)', `const Node = <div aria-disabled={g} />`, { g: () => 'true' }],
  ]
  for (const [name, src, deps] of accessorCases) {
    test(`${name} — compiled matches h()`, async () => {
      // The ROOT must actually take the fast path, or this asserts nothing.
      expect(compiledRootUsesSsr(src.replace('Node', 'N'))).toBe(true)
      const fast = await renderToString(evalSsr(src, deps) as VNode)
      const tag = /<(\w+)/.exec(src)![1]!
      const attr = /\s([\w-]+)=\{g\}/.exec(src)![1]!
      const slow = await renderToString(h(tag, { [attr]: deps.g }))
      expect(fast).toBe(slow)
      // Guard the specific regression: never the function's SOURCE TEXT.
      expect(fast).not.toContain('=&gt;')
    })
  }
})

/**
 * `<textarea value>` — the bail above is the mechanism; this is the DAMAGE it
 * prevents, asserted on the rendered bytes so a regression names the symptom
 * rather than just "expected true to be false".
 */
describe('SSR fast path — a prefilled <textarea> renders its value as CONTENT', () => {
  const shapes: [string, string, Record<string, unknown>][] = [
    ['dynamic value', `const Node = <textarea value={v} />`, { v: 'draft text' }],
    ['accessor value', `const Node = <textarea value={v} />`, { v: () => 'draft text' }],
    ['static value', `const Node = <textarea value="draft text" />`, {}],
    ['nested in an eligible parent', `const Node = <div class="f"><textarea value={v} /></div>`, { v: 'draft text' }],
  ]
  for (const [name, src, deps] of shapes) {
    test(name, async () => {
      const html = await renderToString(evalSsr(src, deps) as VNode)
      // The value IS the text content; there is no `value` CONTENT attribute.
      expect(html).toContain('>draft text</textarea>')
      expect(html).not.toContain('value=')
    })
  }
})

describe('SSR fast path — conditional DOM-element operand is lowered (optimization fired)', () => {
  const lowered: Array<[string, string]> = [
    ['cond && <el> sole', `const N = <div>{on && <span class="badge">{x}</span>}</div>`],
    ['cond ? <el> : null', `const N = <div>{on ? <span>{x}</span> : null}</div>`],
    ['cond ? <a> : <b>', `const N = <div>{on ? <b>{x}</b> : <i>{y}</i>}</div>`],
    ['cond && <el> non-sole', `const N = <div><h1>t</h1>{on && <span>{x}</span>}</div>`],
  ]
  for (const [name, src] of lowered) {
    it(`lowers the branch element to a nested _ssr: ${name}`, () => {
      const { code } = transformJSX_JS(src, 'case.tsx', { ssr: true, ssrTemplate: true })
      // The branch element became `_ssr([...])` INSIDE the `_escSole`/`_esc`
      // hole — i.e. an `_ssr(` that is NOT the root call. Two `_ssr(` occurrences
      // (root + lowered branch) is the tell; the pre-change emit had exactly one.
      const n = (code.match(/_ssr\(/g) ?? []).length
      expect(n).toBeGreaterThanOrEqual(2)
    })
  }
  it('does NOT lower a component-child branch (stays a VNode)', () => {
    const { code } = transformJSX_JS(`const N = <div>{on && <Comp>{x}</Comp>}</div>`, 'c.tsx', { ssr: true, ssrTemplate: true })
    expect(code).toContain('<Comp>')
    expect((code.match(/_ssr\(/g) ?? []).length).toBe(1)
  })
})

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

/**
 * NESTED self-closing / void elements are ELIGIBLE (they used to bail).
 *
 * The bail was commented "rare", but `<img/>`, `<input/>`, `<br/>` and `<hr/>`
 * are in most real markup — and `ssrSerializeElement` returning false
 * PROPAGATES, so a single `<img/>` dropped its whole enclosing component onto
 * the h() path. Only void-free SIBLING subtrees got salvaged into their own
 * `_ssr(...)`, which is why a substring check for `_ssr(` false-positives on
 * this shape: these tests assert the ROOT element compiled to `_ssr`.
 *
 * The byte-identity half is the load-bearing part: the runtime closes a void
 * element as ` />` (`enqueue(`{open} />`)`), so the emitted statics must carry
 * the SPACE. Any other spelling is a hydration-visible divergence.
 */
describe('SSR fast path — nested void / self-closing elements are eligible', () => {
  const eligible: [string, string][] = [
    ['nested <img/>', `const N = <div class="c"><img src="/a.png" alt="a" /></div>`],
    ['<br/> between text', `const N = <p>one<br />two</p>`],
    ['<input/> in a form', `const N = <form action="/x"><input name="q" type="text" /></form>`],
    ['<hr/> between blocks', `const N = <section><p>{a}</p><hr /><p>b</p></section>`],
    ['self-closing non-void <div/>', `const N = <div class="w"><div /><span>{s}</span></div>`],
    ['several void siblings', `const N = <div><img src="/a" /><br /><input value="v" /></div>`],
    // ROOT-level self-closing. #2515 made a NESTED `<img/>` eligible but left
    // the ROOT gate (`ssrTemplate && !isSelfClosing(node)`) in place, so a
    // component whose OWN body is self-closing still fell to h() — and that is
    // the shape of `<Icon>`, `<Avatar>`, `<Divider>`, `<Input>`, `<Spacer>`:
    // exactly the small leaf components a design system renders most often.
    ['ROOT <img/>', `const N = <img src="/a.png" alt="a" />`],
    ['ROOT <hr/>', `const N = <hr class="sep" />`],
    ['ROOT <input/>', `const N = <input type="text" name="q" />`],
    ['ROOT <br/>', `const N = <br />`],
    ['ROOT non-void <div/>', `const N = <div class="box" />`],
    // Component children — the largest hole that remained after self-closing.
    ['wrapper whose only child is a component', `const N = <main class="m"><Widget /></main>`],
    ['component with a dynamic prop', `const N = <main class="m"><Widget id={p.id} /></main>`],
    ['component between static siblings', `const N = <div><header>H</header><Widget /><footer>F</footer></div>`],
    ['two component children', `const N = <div><A /><B /></div>`],
    // Item bodies. `items.map(i => <img src={i.src}/>)` is an image gallery,
    // not an exotic shape; it bailed the whole list onto h() before.
    ['.map item body is <img/>', `const N = <div>{items.map(i => <img src={i.src} />)}</div>`],
    // `by` is required by the keyed SSR path (and by `<For>`'s own contract —
    // see the `for-missing-by` detector); omitting it bails for that reason,
    // not because of the self-closing body.
    ['<For> item body is <img/>', `const N = <div><For each={items} by={(i) => i.id}>{(i) => <img src={i.src} />}</For></div>`],
  ]
  for (const [name, src] of eligible) {
    test(`eligible: ${name}`, () => {
      // ROOT-level assertion — see compiledRootUsesSsr: a plain substring
      // check passes against the broken state via the salvaged sibling.
      expect(compiledRootUsesSsr(src)).toBe(true)
    })
  }

  // A void tag written WITH an explicit children list is ambiguous (the
  // runtime drops the children) — that one still bails, deliberately.
  test('still bails: void element given children', () => {
    expect(compiledRootUsesSsr(`const N = <div><img src="/a.png">x</img></div>`)).toBe(false)
  })

  // JSX extracts `key` specially (it is why `<For>` takes `by`, not `key`), so
  // the two paths could disagree on whether it reaches props. Unverified —
  // therefore bailed rather than guessed at.
  test('still bails: component child carrying a key', () => {
    expect(compiledRootUsesSsr(`const N = <div><Widget key="k" /></div>`)).toBe(false)
  })
})

describe('SSR fast path — conservative bail catalogue (stays on h())', () => {
  const bails: [string, string][] = [
    ['spread attribute', `const N = <div {...props}>y</div>`],
    // NOTE: 'component child' used to live here, and it was the single largest
    // remaining eligibility hole — `<main class="m"><Widget /></main>` emitted
    // ZERO `_ssr`, so every layout wrapper in a real app fell to h(). It is now
    // a PRESERVED-SOURCE hole (`_ssrNode`), with byte-identity against h()
    // asserted above for the sync, async, dynamic-prop, multi-hole,
    // children-passing and provider-sibling shapes.
    // A component child carrying `key` still bails — see below.
    // NOTE: 'void element (self-closing) at ROOT' used to live here. It was a
    // SCOPE decision, not a safety one — the comment said the root gate was
    // "intentionally untouched" because #2515 only widened the nested case.
    // The byte-identity oracles above now cover ROOT <img/>, <hr/>, <input/>
    // and non-void <div/> against the h() path, so the conservatism had no
    // remaining justification and the entry moved to the eligible list.
    ['select element', `const N = <select value="b"><option>a</option></select>`],
    // `<textarea value>` is the other half of the PZ-09 concern that bails
    // `select`. <textarea> has NO `value` CONTENT attribute — the value IS the
    // text content — so `renderProp` skips it and `textareaValue` emits it as
    // the child. The fast path serialized it as an attribute instead, giving a
    // dead `value="…"` AND an EMPTY textarea: every server-rendered prefilled
    // textarea came back blank (blank with JS off, and a hydration mismatch).
    // Both the static and the dynamic spelling must bail — the static one took
    // the compile-time bake arm, which no runtime helper guards.
    ['textarea value (dynamic)', `const N = <textarea value={v} />`],
    ['textarea value (static)', `const N = <textarea value="draft" />`],
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

  /**
   * Component children are the shape where getting this wrong breaks
   * HYDRATION rather than merely producing different bytes, so the byte
   * oracles above are necessary but not sufficient: they compare two SSR
   * strings, and hydration is what happens when the client walks that DOM.
   *
   * The async case is the one that matters most — `renderComponent` brackets a
   * pending component with `<!--$pas-->`/`<!--$pae-->` precisely so the client
   * can locate the range and attach reactivity. If the fast path emitted those
   * markers in a different place (or dropped them), hydration would silently
   * mis-align every following sibling.
   */
  test('a component child inside an _ssr wrapper hydrates with no mismatch', async () => {
    const Widget = (p: { id: number }) => h('section', { class: 'w' }, String(p.id))
    const ssrNode = evalSsr(
      `const Node = <main class="m"><header>H</header><Widget id={id} /><footer>F</footer></main>`,
      { Widget, id: 7 },
    ) as VNode
    const html = await renderToString(ssrNode)

    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)

    const mismatches: unknown[] = []
    const off = onHydrationMismatch((e) => mismatches.push(e))
    const clientTree = h(
      'main',
      { class: 'm' },
      h('header', null, 'H'),
      h(Widget as never, { id: 7 }),
      h('footer', null, 'F'),
    )
    const dispose = hydrateRoot(container, clientTree)
    expect(mismatches).toEqual([])
    expect(container.querySelectorAll('section.w').length).toBe(1)
    expect(container.textContent).toBe('H7F')
    off()
    dispose()
    document.body.removeChild(container)
  })

  test('an ASYNC component child hydrates over its $pas/$pae range', async () => {
    const Slow = async () => h('em', null, 'late')
    const ssrNode = evalSsr(`const Node = <main class="m"><Slow /><footer>F</footer></main>`, {
      Slow,
    }) as VNode
    const html = await renderToString(ssrNode)
    // The sentinels are what hydration keys on — assert they actually shipped.
    expect(html).toContain('<!--$pas-->')
    expect(html).toContain('<!--$pae-->')

    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)

    const mismatches: unknown[] = []
    const off = onHydrationMismatch((e) => mismatches.push(e))
    const dispose = hydrateRoot(
      container,
      h('main', { class: 'm' }, h(Slow as never, null), h('footer', null, 'F')),
    )
    await Promise.resolve()
    expect(mismatches).toEqual([])
    expect(container.textContent).toContain('F')
    off()
    dispose()
    document.body.removeChild(container)
  })
})

describe('component holes run at their RENDER position, not their call site', () => {
  // THE regression this whole mechanism exists for.
  //
  // An `_ssr(...)` hole is an ordinary argument, so it evaluates at the CALL
  // SITE. For a hole that reads a value that matches h(); for a hole that
  // RENDERS a component it does not, because rendering pushes context and h()
  // defers it. An earlier attempt emitted the hole eagerly, passed every gate
  // in this file, and still broke 26 ui-showcase specs — because every gate
  // here rendered the node at TOP LEVEL, the one position where the two
  // timings coincide.
  //
  // These cases are the whole position space. BISECT-VERIFIED (emit reverted to
  // the eager form): COMPONENT-CHILDREN and MODULE-CONST are the load-bearing
  // pair — both render `DEFAULT` instead of `PROVIDED` without the deferral.
  // RETURN and HELPER-CALL pass either way and are SMOKE, for different
  // reasons worth knowing: RETURN is genuinely the position where call site
  // and render position coincide, while HELPER-CALL is already protected by an
  // unrelated existing mechanism — the compiler rewrites a CALL in a component
  // child (`{row()}`) to an accessor (`{() => row()}`), which is lazy. A bare
  // identifier (`{frag}`) gets no such wrap, which is why MODULE-CONST bites.
  const Theme = createContext<string>('DEFAULT')
  const Consumer = () => h('i', { class: 'c' }, useContext(Theme))

  /** Compile `src`, eval it with `deps`, render, and return the HTML. */
  async function renderSrc(src: string, deps: Record<string, unknown>): Promise<string> {
    return await renderToString(evalSsr(src, deps) as never)
  }

  it('RETURN position — the case that was always safe still works', async () => {
    // `Page` RETURNS the templated tree, so its thunk runs when `Page` renders
    // — already inside the provider. This is the one position an eager hole
    // also got right, which is exactly why the old gates all passed.
    const src = `const Page = () => <div class="p"><Consumer /></div>
const Node = <Prov><Page /></Prov>`
    const Prov = (p: { children?: unknown }) => {
      provide(Theme, 'PROVIDED')
      return h('main', null, p.children as never)
    }
    const html = await renderSrc(src, { Consumer, Prov })
    expect(html).toContain('PROVIDED')
    expect(html).not.toContain('DEFAULT')
  })

  it('COMPONENT-CHILDREN position — the shape that broke 26 e2e specs', async () => {
    const src = `const Node = <Prov><div class="p"><Consumer /></div></Prov>`
    const Prov = (p: { children?: unknown }) => {
      provide(Theme, 'PROVIDED')
      return h('main', null, p.children as never)
    }
    const html = await renderSrc(src, { Consumer, Prov })
    expect(html).toContain('PROVIDED')
    expect(html).not.toContain('DEFAULT')
    // and byte-identical to the h() path
    const oracle = await renderToString(
      h(Prov as never, null, h('div', { class: 'p' }, h(Consumer as never, null))) as never,
    )
    expect(html).toBe(oracle)
  })

  it('MODULE-CONST position — evaluated long before any provider exists', async () => {
    const src = `const frag = <div class="p"><Consumer /></div>
const Node = <Prov>{frag}</Prov>`
    const Prov = (p: { children?: unknown }) => {
      provide(Theme, 'PROVIDED')
      return h('main', null, p.children as never)
    }
    const html = await renderSrc(src, { Consumer, Prov })
    expect(html).toContain('PROVIDED')
    expect(html).not.toContain('DEFAULT')
  })

  it('HELPER-CALL position — a plain function invoked in a children argument', async () => {
    const src = `const row = () => <div class="p"><Consumer /></div>
const Node = <Prov>{row()}</Prov>`
    const Prov = (p: { children?: unknown }) => {
      provide(Theme, 'PROVIDED')
      return h('main', null, p.children as never)
    }
    const html = await renderSrc(src, { Consumer, Prov })
    expect(html).toContain('PROVIDED')
    expect(html).not.toContain('DEFAULT')
  })

  it('a provider FRAME does not leak out of the deferred subtree', async () => {
    // Two sibling templated subtrees; the first provides, the second must NOT
    // see it. `renderComponent` owns the trimming — deferring must not move it.
    const src = `const Node = <div><Inner /><Outer /></div>`
    const Inner = () => {
      provide(Theme, 'INNER')
      return h('i', null, useContext(Theme))
    }
    const Outer = () => h('o', null, useContext(Theme))
    const html = await renderSrc(src, { Inner, Outer })
    expect(html).toBe('<div><i>INNER</i><o>DEFAULT</o></div>')
  })
})

// Reference so unused-import guards don't strip the hydration helpers when the
// hydration block is edited; also keeps `mount`/`Fragment`/`disableHydrationWarnings`
// available for follow-up specs.
void mount
void Fragment
void disableHydrationWarnings
