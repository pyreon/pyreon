/**
 * Regression lock — DEFERRED `_tpl` build during hydration.
 *
 * THE MEASURED PROBLEM (docs `/docs/router`, SSG build): an h()-rooted layout
 * component evaluates its compiled-template children EAGERLY as h() arguments —
 * `j('div', {children:[ j(Header), _tpl('<main …>', bind), j(Search) ]})` — so
 * the FIRST `_tpl` in the component's armed window consumed the one-shot
 * adoption target meant for the component ROOT (a DIV), failed the root-tag
 * gate (MAIN ≠ DIV), CLONED, and its bind mounted the entire route subtree
 * into the detached clone. One consumed arm cost ~95% of the page's retention.
 *
 * THE FIX (template.ts + hydrate.ts): while `hydrateRoot`'s synchronous walk
 * is active (`_setHydrationActive`), `_tpl` DEFERS its build — it returns a
 * lazy NativeItem, and `hydrateChild` calls `__adoptAt(cursor)` when the item
 * meets its REAL DOM cursor. Only a live arm whose root tag MATCHES keeps the
 * historical eager path (component roots, `<For>` rows + plan replay); a
 * MISMATCHED arm is left untouched for the element it belongs to.
 *
 * Every app-shaped spec compiles REAL JSX through `transformJSX` (the actual
 * client emit) and hydrates over REAL `renderToString` output. The one
 * exception is the mount-hole spec, which hand-writes the emit shape the
 * built docs bundle produces verbatim (`_tpl('<main … data-pyreon-hole></main>',
 * el => _mountChild(h(Comp), el, null))` as an h() child) — plain
 * `transformJSX` does not emit a hole for that shape outside the vite-plugin
 * pipeline, and the shape is the acceptance case for the docs page.
 *
 * Bisect (recorded in the PR):
 *  - neutering `_tpl`'s `_hydrationActive` deferral (always `buildTpl`) fails
 *    the adopt-at-cursor / arm-intact / nested / lazy-item specs;
 *  - neutering `hydrateChild`'s `__adoptAt` call fails the adopt-at-cursor +
 *    nested specs (retention collapses to the swap path);
 *  - neutering `ensureBuilt` in the lazy getter fails the verify-bail swap +
 *    bare-`.el` specs.
 */
import { transformJSX } from '@pyreon/compiler'
import { For, Fragment, _lc, h } from '@pyreon/core'
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
  _setStyle,
  _tpl,
  hydrateRoot,
} from '../index'
import { bindPolymorphicText } from '../mount'
import {
  _setHydrationActive,
  _setTplAdoptTarget,
  _setTplAdoptVerifier,
  type DeferredNativeItem,
} from '../template'
import { tplAdoptVerify } from '../hydration-plan'

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

// ─── Real-transform harness (same shape as hydrate-component-tpl-adoption) ───
const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setAttr,
  _setClass,
  _mountSlot,
  _mountChild,
  _lc,
  bindPolymorphicText,
  h,
  Fragment,
  For,
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

function compileApp(source: string, globals: Record<string, unknown> = {}): () => unknown {
  const { code } = transformJSX(source, 'test.tsx')
  const body = lowerResidualJsx(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''))
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `${body}\nreturn App`)
  return fn(...DEP_VALUES, ...Object.values(globals)) as () => unknown
}

async function ssrInto(vnode: unknown): Promise<HTMLElement> {
  const html = await renderToString(vnode as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

/** Hydrate and FAIL LOUDLY on any hydration console.error — a throw is caught
 *  by the error boundary and leaves a plausible-looking DOM behind. */
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

// The docs-layout theft shape: an h()-rooted component (dynamic root class
// bails templatization) whose children are components AROUND an inline
// compiled-template region. The `_tpl('<main …')` runs as an h() ARGUMENT —
// first `_tpl` in the component's armed window.
const MID_TPL = `
const Header = () => <header class="hd">H</header>
const Footer = () => <footer class="ft">F</footer>
const App = () => <div class={dyn()}><Header /><main class="mn"><span class="in">inner</span></main><Footer /></div>`

const midTplSsrTree = () =>
  h(
    'div',
    { class: () => 'shell' },
    h(() => h('header', { class: 'hd' }, 'H'), null),
    h('main', { class: 'mn' }, h('span', { class: 'in' }, 'inner')),
    h(() => h('footer', { class: 'ft' }, 'F'), null),
  )

describe('deferred _tpl adoption during hydration', () => {
  it('an INLINE _tpl child of an h()-rooted component ADOPTS at its own cursor (docs-layout shape)', async () => {
    const host = await ssrInto(midTplSsrTree())
    const header = host.querySelector('header') as HTMLElement
    const main = host.querySelector('main') as HTMLElement
    const span = host.querySelector('span') as HTMLElement
    const footer = host.querySelector('footer') as HTMLElement

    const App = compileApp(MID_TPL, { dyn: () => 'shell' })
    const dispose = hydrateLoud(host, h(App as never, null))

    // The mid-array `_tpl` deferred past the component-root arm (tag mismatch
    // MAIN ≠ DIV left the arm untouched) and adopted at ITS cursor.
    expect(host.querySelector('main')).toBe(main)
    expect(host.querySelector('span')).toBe(span)
    // The sibling components' roots still adopt via the eager armed path.
    expect(host.querySelector('header')).toBe(header)
    expect(host.querySelector('footer')).toBe(footer)
    // header + main + footer (the root div is h()-hydrated, not a _tpl).
    expect(tplAdopted()).toBe(3)
    expect(host.querySelectorAll('main')).toHaveLength(1)
    dispose()
  })

  it('preserves user state living on the deferred-adopted nodes (typed value + focus)', async () => {
    // The component sibling is what forces the h()-rooted (bailed) shape —
    // without it the WHOLE root templatizes (dynamic attrs alone do not bail)
    // and the spec would exercise the eager root path instead of deferral.
    const host = await ssrInto(
      h(
        'div',
        { class: () => 'shell' },
        h(() => h('header', { class: 'hh' }, 'H'), null),
        h('section', { class: 'frm' }, h('input', { name: 'q', type: 'text' })),
      ),
    )
    const input = host.querySelector('input') as HTMLInputElement
    input.value = 'typed before hydration'
    input.focus()
    expect(document.activeElement).toBe(input)

    const App = compileApp(
      `const Header = () => <header class="hh">H</header>
const App = () => <div class={dyn()}><Header /><section class="frm"><input name="q" type="text" /></section></div>`,
      { dyn: () => 'shell' },
    )
    const dispose = hydrateLoud(host, h(App as never, null))

    const after = host.querySelector('input') as HTMLInputElement
    expect(after).toBe(input) // adopted, not swapped
    expect(after.value).toBe('typed before hydration')
    expect(document.activeElement).toBe(after)
    dispose()
  })

  it('a deferred-adopted region stays REACTIVE — signal flip patches the SSR text in place', async () => {
    const label = signal('before')
    // Component sibling forces the bailed h() root — see the spec above.
    const host = await ssrInto(
      h(
        'div',
        { class: () => 'shell' },
        h(() => h('header', { class: 'hh' }, 'H'), null),
        h('p', { class: 'r' }, () => label()),
      ),
    )
    const p = host.querySelector('p') as HTMLElement

    const App = compileApp(
      `const Header = () => <header class="hh">H</header>
const App = () => <div class={dyn()}><Header /><p class="r">{() => label()}</p></div>`,
      { dyn: () => 'shell', label },
    )
    const dispose = hydrateLoud(host, h(App as never, null))
    expect(host.querySelector('p')).toBe(p)
    expect(p.textContent).toBe('before')
    label.set('after')
    expect(p.textContent).toBe('after')
    dispose()
  })

  it('deferred + verify BAIL → clone swap, page stays correct with no duplication', async () => {
    const host = await ssrInto(midTplSsrTree())
    const main = host.querySelector('main') as HTMLElement
    // Server/client divergence: an extra ELEMENT child fails the skeleton gate
    // (extra ATTRS are tolerated by design — dynamic attrs are absent from the
    // template, so attribute divergence cannot be the discriminator).
    main.appendChild(document.createElement('em'))

    const App = compileApp(MID_TPL, { dyn: () => 'shell' })
    const dispose = hydrateLoud(host, h(App as never, null))

    // Swapped, not adopted: the client's form wins, the server node is gone.
    const liveMain = host.querySelector('main') as HTMLElement
    expect(liveMain).not.toBe(main)
    expect(liveMain.querySelector('em')).toBeNull()
    expect(liveMain.outerHTML).toBe('<main class="mn"><span class="in">inner</span></main>')
    expect(host.querySelectorAll('main')).toHaveLength(1)
    // The sibling AFTER the swapped region still hydrates at its cursor.
    expect(host.querySelectorAll('footer')).toHaveLength(1)
    dispose()
  })

  it('NESTED recursion — a deferred mount-hole template adopts and its component child hydrates in place (built-docs emit shape)', async () => {
    // Verbatim shape from the built docs bundle:
    //   j('div', {children:[ j(Header), _tpl('<main class="docs-main"
    //   data-pyreon-hole></main>', e => _mountChild(j(RouterView,{}), e, null)),
    //   j(Search) ]})
    // The hole template must be parsed FRESH for the marker to register, so the
    // class name is unique to this spec.
    const Inner = () => h('article', { class: 'pp' }, h('b', null, 'deep'))
    const host = await ssrInto(
      h(
        'div',
        { class: () => 'shell' },
        h(() => h('header', { class: 'hd2' }, 'H'), null),
        h('main', { class: 'hole-mn' }, h(Inner, null)),
      ),
    )
    const main = host.querySelector('main') as HTMLElement
    const article = host.querySelector('article') as HTMLElement
    const b = host.querySelector('b') as HTMLElement

    const App = () =>
      h(
        'div',
        { class: () => 'shell' },
        // NativeItem-as-child is what the compiled emit produces; the type
        // system models only the VNode surface, hence the `as never` casts.
        h((() => _tpl('<header class="hd2">H</header>', () => null)) as never, null),
        _tpl('<main class="hole-mn" data-pyreon-hole></main>', (el) =>
          _mountChild(h(Inner, null), el, null),
        ) as never,
      )
    const dispose = hydrateLoud(host, h(App as never, null))

    // The deferred hole template adopted its <main> …
    expect(host.querySelector('main')).toBe(main)
    // … and threaded the hole cursor, so the component child HYDRATED the
    // server nodes in place instead of appending a second copy.
    expect(host.querySelector('article')).toBe(article)
    expect(host.querySelector('b')).toBe(b)
    expect(host.querySelectorAll('article')).toHaveLength(1)
    expect(main.innerHTML).toBe('<article class="pp"><b>deep</b></article>')
    dispose()
  })

  it('a tag-MISMATCHED armed call leaves the arm intact for the call it belongs to', () => {
    // Unit-level: verifier registered, arm pointed at a server DIV; a MAIN
    // template must NOT consume it, so the following DIV template still
    // adopts the armed node.
    const server = document.createElement('div')
    server.className = 'd'
    server.textContent = 'x'
    document.body.appendChild(server)
    _setTplAdoptVerifier(tplAdoptVerify)
    const prevActive = _setHydrationActive(true)
    _setTplAdoptTarget(server)
    try {
      const mismatched = _tpl(`<main class="arm-m"></main>`, () => null)
      expect((mismatched as unknown as DeferredNativeItem).__deferred).toBe(true)
      const matched = _tpl(`<div class="d">x</div>`, () => null)
      // The arm SURVIVED the mismatched call and this call consumed it.
      expect((matched as { el: unknown }).el).toBe(server)
      expect(tplAdopted()).toBe(1)
    } finally {
      _setTplAdoptTarget(null)
      _setHydrationActive(prevActive)
      server.remove()
    }
  })

  it('a bare .el read before the walk builds a clone (today behavior), memoized', () => {
    const prevActive = _setHydrationActive(true)
    try {
      let bindRuns = 0
      const item = _tpl(`<div class="lazy-z">t</div>`, () => {
        bindRuns++
        return null
      }) as unknown as DeferredNativeItem
      expect(item.__deferred).toBe(true)
      expect(bindRuns).toBe(0) // nothing built yet
      const el = item.el
      expect(bindRuns).toBe(1)
      expect(el).toBeInstanceOf(HTMLElement)
      expect(el.className).toBe('lazy-z')
      expect(el.isConnected).toBe(false) // a clone, not an adoption
      expect(item.el).toBe(el) // memoized — no rebuild on re-read
      expect(bindRuns).toBe(1)
      // Built already ⇒ a later cursor cannot re-adopt.
      expect(item.__adoptAt(document.createElement('div'))).toBe(false)
    } finally {
      _setHydrationActive(prevActive)
    }
  })

  it('cleanup on a NEVER-BUILT deferred item is a no-op — bind never runs, nothing throws', () => {
    const prevActive = _setHydrationActive(true)
    try {
      let bindRuns = 0
      const item = _tpl(`<div class="never-built">t</div>`, () => {
        bindRuns++
        return null
      }) as unknown as DeferredNativeItem
      expect(() => item.cleanup()).not.toThrow()
      expect(bindRuns).toBe(0)
    } finally {
      _setHydrationActive(prevActive)
    }
  })

  it('a MULTI-ROOT template cannot adopt — __adoptAt reports false and the clone fallback stands', () => {
    const server = document.createElement('i')
    server.textContent = 'a'
    document.body.appendChild(server)
    _setTplAdoptVerifier(tplAdoptVerify)
    const prevActive = _setHydrationActive(true)
    try {
      const item = _tpl(`<i class="mr">a</i><i class="mr">b</i>`, () => null) as unknown as DeferredNativeItem
      expect(item.__deferred).toBe(true)
      expect(item.__adoptAt(server)).toBe(false) // verifier refuses multi-root
      expect(item.el).not.toBe(server) // built a clone instead
      expect(item.el.className).toBe('mr')
    } finally {
      _setHydrationActive(prevActive)
      server.remove()
    }
  })

  it('CSR is untouched — outside hydration `_tpl` builds eagerly with no deferral marker', () => {
    let bindRuns = 0
    const item = _tpl(`<div class="csr-e">t</div>`, () => {
      bindRuns++
      return null
    })
    expect(bindRuns).toBe(1) // built during the call, as always
    expect((item as unknown as { __deferred?: boolean }).__deferred).toBeUndefined()
    expect(item.el.className).toBe('csr-e')
  })
})
