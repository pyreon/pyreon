/**
 * Regression lock — `dangerouslySetInnerHTML` TRUSTS the server DOM during
 * hydration (React's exact semantics).
 *
 * THE MEASURED PROBLEM (docs `/docs/router`, SSG build, post-#3018): 9,111 of
 * the page's 9,511 still-rebuilt body nodes sat under `.code-block` — Shiki
 * HTML re-parsed into fresh nodes on every load despite being byte-identical
 * to the server's. Instrumentation showed all 132 code-block `_tpl` calls WERE
 * armed at their real cursor (the #3018 deferral worked) and all 132 bailed in
 * `matchDomAgainstTemplate`: an innerHTML-bearing template element is EMPTY
 * while its SSR counterpart is FULL (the server renders `__html` as inner
 * content), so the verifier read the parsed payload as extra elements and
 * cloned the whole template — and even a passing verify would have lost the
 * nodes to the bind's inline `el.innerHTML = …` re-assignment.
 *
 * THE FIX, three coordinated seams:
 *  - COMPILER (both backends, byte-identical): a `dangerouslySetInnerHTML`
 *    binding emits `_setHtml(el, expr)` (the `_setClass`/`_setStyle` rule —
 *    export the runtime normalizer, emit a call to it) and bakes
 *    `data-pyreon-html` onto the template element (the `data-pyreon-hole`
 *    declaration mechanism).
 *  - VERIFIER (hydration-plan.ts): a DECLARED innerHTML element accepts ANY
 *    server children — the binding owns them — with NO string comparison
 *    (innerHTML serialization round-trips differ: entity encoding, attribute
 *    quoting; React compares nothing, and neither do we). On a full match the
 *    element is marked in the `_setHtml` adoption registry.
 *  - SINK (props.ts `applyDangerousHtml` = `_setHtml`): the FIRST write to a
 *    marked element is SKIPPED — the server children ARE the parse of
 *    `__html`. Later writes (reactive re-runs, post-hydration flips, all of
 *    CSR) assign as before. The h() hydration path marks via
 *    `hydrateElement` (the PZ-09 `<select value>` sibling — but skip-first,
 *    not defer, because the reactive form's effect must still RUN to
 *    subscribe).
 *
 * THE DOCUMENTED TRADE (React's): a client `__html` that GENUINELY differs
 * from the server's shows the server content until the first reactive update.
 * Locked by its own spec below so the divergence stays deliberate.
 *
 * Bisect (recorded in the PR):
 *  - reverting the sink's adoption skip (always assign) fails the identity
 *    specs — innerHTML re-parse produces fresh nodes;
 *  - reverting the verifier's declared-innerHTML exemption fails the
 *    template-path adoption specs (`runtime.tpl.adopt` stays 0, whole
 *    code-block clones).
 */
import { transformJSX } from '@pyreon/compiler'
import { Fragment, _lc, h } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _applyProps,
  _bindDirect,
  _bindText,
  _mountChild,
  _mountSlot,
  _setAttr,
  _setClass,
  _setHtml,
  _setStyle,
  _tpl,
  hydrateRoot,
  mount,
} from '../index'
import { bindPolymorphicText } from '../mount'

// ─── Counter sink ────────────────────────────────────────────────────────────
const g = globalThis as { __pyreon_count__?: ((name: string, n?: number) => void) | undefined }
let counts: Record<string, number>
let prevSink: typeof g.__pyreon_count__
beforeEach(() => {
  counts = {}
  prevSink = g.__pyreon_count__
  g.__pyreon_count__ = (name, n = 1) => {
    counts[name] = (counts[name] ?? 0) + n
  }
})
afterEach(() => {
  g.__pyreon_count__ = prevSink
  document.body.innerHTML = ''
})
const tplAdopted = () => counts['runtime.tpl.adopt'] ?? 0

// ─── Real-transform harness (same shape as hydrate-tpl-deferred-adoption) ────
const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setAttr,
  _setClass,
  _setHtml,
  _mountSlot,
  _mountChild,
  _lc,
  bindPolymorphicText,
  h,
  Fragment,
  signal,
}
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

const lowerResidualJsx = (code: string) =>
  transformSync(code, {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code

function compileApp(source: string, globals: Record<string, unknown> = {}): (p?: never) => unknown {
  const { code } = transformJSX(source, 'test.tsx')
  const body = lowerResidualJsx(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''))
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `${body}\nreturn App`)
  return fn(...DEP_VALUES, ...Object.values(globals)) as (p?: never) => unknown
}

async function ssrInto(vnode: unknown): Promise<HTMLElement> {
  const html = await renderToString(vnode as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

/** Hydrate and FAIL LOUDLY on any hydration console.error. */
function hydrateLoud(host: HTMLElement, vnode: unknown): () => void {
  const errs: string[] = []
  const realError = console.error
  console.error = (...a: unknown[]) => {
    errs.push(a.map(String).join(' '))
  }
  let dispose: () => void
  try {
    dispose = hydrateRoot(host, vnode as never)
  } finally {
    console.error = realError
  }
  if (errs.length > 0) throw new Error(`hydration errored: ${errs.join(' | ')}`)
  return dispose
}

const stripComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '')

// Shiki-shaped payload — nested spans, an attribute, an entity.
const SHIKI = '<pre class="shiki"><code><span style="color:#111">const</span> <span>x &amp; y</span></code></pre>'

// The CodeBlock shape: static-class wrapper, an innerHTML pre forwarded from
// props, plus a static sibling so the template has a real skeleton around it.
const CB_SRC = `
const App = (props) => (
  <div class="cb">
    <div class="pre" dangerouslySetInnerHTML={props.html} />
    <span class="cap">caption</span>
  </div>
)`

const cbSsrTree = (payload: string) =>
  h(
    'div',
    { class: 'cb' },
    h('div', { class: 'pre', dangerouslySetInnerHTML: { __html: payload } }),
    h('span', { class: 'cap' }, 'caption'),
  )

describe('dangerouslySetInnerHTML hydration adoption — compiled template path', () => {
  it('adopts the server DOM: node identity preserved, template adopted, nothing re-parsed', async () => {
    const host = await ssrInto(cbSsrTree(SHIKI))
    const pre = host.querySelector('.pre') as HTMLElement
    const codeSpan = host.querySelector('.pre span') as HTMLElement
    const cap = host.querySelector('.cap') as HTMLElement
    expect(codeSpan).not.toBeNull()

    const App = compileApp(CB_SRC)
    const dispose = hydrateLoud(host, h(App as never, { html: { __html: SHIKI } } as never))

    // The whole template adopted …
    expect(tplAdopted()).toBe(1)
    // … and the innerHTML content kept its IDENTITY — not a fresh parse.
    expect(host.querySelector('.pre')).toBe(pre)
    expect(host.querySelector('.pre span')).toBe(codeSpan)
    expect(host.querySelector('.cap')).toBe(cap)
    // Content intact (entity round-trip included).
    expect(host.querySelector('.pre code')?.textContent).toBe('const x & y')
    dispose()
  })

  it('adopts BOTH innerHTML elements of a two-element template (gutter + pre, the CodeBlock shape)', async () => {
    const GUTTER = '<span class="ln">1</span><span class="ln">2</span>'
    const src = `
const App = (props) => (
  <div class="cb">
    <div class="gut" dangerouslySetInnerHTML={props.gutter} />
    <div class="pre" dangerouslySetInnerHTML={props.html} />
  </div>
)`
    const host = await ssrInto(
      h(
        'div',
        { class: 'cb' },
        h('div', { class: 'gut', dangerouslySetInnerHTML: { __html: GUTTER } }),
        h('div', { class: 'pre', dangerouslySetInnerHTML: { __html: SHIKI } }),
      ),
    )
    const ln = host.querySelector('.gut .ln') as HTMLElement
    const codeEl = host.querySelector('.pre code') as HTMLElement

    const App = compileApp(src)
    const dispose = hydrateLoud(
      host,
      h(App as never, { gutter: { __html: GUTTER }, html: { __html: SHIKI } } as never),
    )
    expect(tplAdopted()).toBe(1)
    expect(host.querySelector('.gut .ln')).toBe(ln)
    expect(host.querySelector('.pre code')).toBe(codeEl)
    dispose()
  })

  it('adopts an EMPTY innerHTML element (the no-line-numbers gutter)', async () => {
    const src = `
const App = (props) => (
  <div class="cb">
    <div class="gut" dangerouslySetInnerHTML={props.gutter} />
    <span class="cap">c</span>
  </div>
)`
    const host = await ssrInto(
      h(
        'div',
        { class: 'cb' },
        h('div', { class: 'gut', dangerouslySetInnerHTML: { __html: '' } }),
        h('span', { class: 'cap' }, 'c'),
      ),
    )
    const gut = host.querySelector('.gut') as HTMLElement
    const App = compileApp(src)
    const dispose = hydrateLoud(host, h(App as never, { gutter: { __html: '' } } as never))
    expect(tplAdopted()).toBe(1)
    expect(host.querySelector('.gut')).toBe(gut)
    expect(gut.childNodes).toHaveLength(0)
    dispose()
  })

  it('reactive innerHTML: FIRST run adopts (identity kept), a later signal write re-assigns', async () => {
    const src = `
const html = signal({ __html: '<b class="one">one</b>' })
const App = () => (
  <div class="cb">
    <div class="pre" dangerouslySetInnerHTML={html()} />
  </div>
)`
    const host = await ssrInto(
      h(
        'div',
        { class: 'cb' },
        h('div', { class: 'pre', dangerouslySetInnerHTML: { __html: '<b class="one">one</b>' } }),
      ),
    )
    const b = host.querySelector('.pre b') as HTMLElement

    // Compile with the signal INSIDE the module so the emit is the reactive
    // form; recover it via a side channel to drive the post-hydration flip.
    const captured: { sig?: (v?: never) => unknown } = {}
    const { code } = transformJSX(
      `${src}\ncapture(html)`,
      'test.tsx',
    )
    const body = lowerResidualJsx(
      code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''),
    )
    const fn = new Function(...DEP_NAMES, 'capture', `${body}\nreturn App`)
    const App = fn(...DEP_VALUES, (s: never) => {
      captured.sig = s
    }) as () => unknown

    const dispose = hydrateLoud(host, h(App as never, null))
    // First (adopting) run trusted the server DOM.
    expect(tplAdopted()).toBe(1)
    expect(host.querySelector('.pre b')).toBe(b)

    // A genuine post-hydration flip WRITES — fresh content replaces the old.
    ;(captured.sig as unknown as { set: (v: unknown) => void }).set({
      __html: '<i class="two">two</i>',
    })
    expect(host.querySelector('.pre b')).toBeNull()
    expect(host.querySelector('.pre i')?.textContent).toBe('two')
    dispose()
  })

  it('CSR is untouched: a fresh client mount assigns innerHTML exactly as before', () => {
    const App = compileApp(CB_SRC)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const dispose = mount(h(App as never, { html: { __html: SHIKI } } as never), container)
    expect(container.querySelector('.pre code')?.textContent).toBe('const x & y')
    expect(container.querySelector('.pre pre.shiki')).not.toBeNull()
    expect(tplAdopted()).toBe(0)
    dispose()
  })

  it('PARITY: SSR+hydrate DOM equals a fresh client-mount DOM (comment-normalized)', async () => {
    const App = compileApp(CB_SRC)
    const props = { html: { __html: SHIKI } } as never

    const hostA = await ssrInto(cbSsrTree(SHIKI))
    const disposeA = hydrateLoud(hostA, h(App as never, props))

    const hostB = document.createElement('div')
    document.body.appendChild(hostB)
    const disposeB = mount(h(App as never, props), hostB)

    expect(stripComments(hostA.innerHTML)).toBe(stripComments(hostB.innerHTML))
    disposeA()
    disposeB()
  })

  it('DOCUMENTED TRADE: a client __html that differs from the server shows the SERVER content (no comparison, React semantics)', async () => {
    const host = await ssrInto(cbSsrTree('<b class="srv">server</b>'))
    const App = compileApp(CB_SRC)
    const dispose = hydrateLoud(
      host,
      h(App as never, { html: { __html: '<b class="cli">client</b>' } } as never),
    )
    expect(tplAdopted()).toBe(1)
    expect(host.querySelector('.pre .srv')?.textContent).toBe('server')
    expect(host.querySelector('.pre .cli')).toBeNull()
    dispose()
  })
})

describe('dangerouslySetInnerHTML hydration adoption — h() path', () => {
  it('adopts the server DOM for a plain h() element (identity preserved)', async () => {
    const tree = () =>
      h('section', null, h('div', { class: 'pre', dangerouslySetInnerHTML: { __html: SHIKI } }))
    const host = await ssrInto(tree())
    const codeSpan = host.querySelector('.pre span') as HTMLElement

    const dispose = hydrateLoud(host, tree())
    expect(host.querySelector('.pre span')).toBe(codeSpan)
    expect(host.querySelector('.pre code')?.textContent).toBe('const x & y')
    dispose()
  })

  it('reactive (accessor) h() form: first run adopts, a later write re-assigns', async () => {
    const sig = signal<{ __html: string }>({ __html: '<b class="one">one</b>' })
    const host = await ssrInto(
      h('section', null, h('div', { class: 'pre', dangerouslySetInnerHTML: sig() })),
    )
    const b = host.querySelector('.pre b') as HTMLElement

    const dispose = hydrateLoud(
      host,
      h('section', null, h('div', { class: 'pre', dangerouslySetInnerHTML: () => sig() })),
    )
    expect(host.querySelector('.pre b')).toBe(b)

    sig.set({ __html: '<i class="two">two</i>' })
    expect(host.querySelector('.pre b')).toBeNull()
    expect(host.querySelector('.pre i')?.textContent).toBe('two')
    dispose()
  })

  it('PARITY: h()-path SSR+hydrate DOM equals client-mount DOM', async () => {
    const tree = () =>
      h('section', null, h('div', { class: 'pre', dangerouslySetInnerHTML: { __html: SHIKI } }))
    const hostA = await ssrInto(tree())
    const disposeA = hydrateLoud(hostA, tree())

    const hostB = document.createElement('div')
    document.body.appendChild(hostB)
    const disposeB = mount(tree(), hostB)

    expect(stripComments(hostA.innerHTML)).toBe(stripComments(hostB.innerHTML))
    disposeA()
    disposeB()
  })

  it('CSR h() mount is untouched', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const dispose = mount(
      h('div', { class: 'pre', dangerouslySetInnerHTML: { __html: SHIKI } }),
      container,
    )
    expect(container.querySelector('.pre code')?.textContent).toBe('const x & y')
    dispose()
  })
})
