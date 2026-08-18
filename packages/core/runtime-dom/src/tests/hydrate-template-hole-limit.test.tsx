/**
 * The MOUNT-HOLE limit on compiled-template hydration adoption — the reason
 * `templatizeComponentChildren` is still default OFF, recorded as executable
 * measurement rather than prose.
 *
 * `hydrateComponent` arms a one-shot `_tpl` adopt target with the component's
 * SSR cursor, so a component-root template binds against the server nodes
 * instead of cloning them. That works for a template whose element tree is
 * COMPLETE. It stops at the first MOUNT HOLE — a position the template leaves
 * empty for the bind to fill (`_mountSlot` behind a `<!>` placeholder, or a
 * component absorbed by `templatizeComponentChildren` via `_mountChild`).
 *
 * The prior recorded diagnosis was "a template in component-child position is
 * an eager argument with no cursor to arm". That is NOT the mechanism, and
 * `emptyHoleAdopts` below is the disproof: the cursor IS armed, DOES reach a
 * templatized component root, and adoption fires — as long as the hole is
 * empty. What blocks it is the hole's CONTENT, not the arming.
 *
 * Closing this needs THREE things, each pinned by a spec here:
 *
 *  1. The adopt verifier must SKIP the DOM range belonging to a hole.
 *     `matchDomAgainstTemplate` walks every DOM element child against a flat
 *     template tag list, so hole content reads as "extra elements" and the
 *     match is rejected  → `componentHoleBlocksAdoption`.
 *  2. The compiled bind must HYDRATE the hole rather than MOUNT it. Relaxing
 *     (1) alone is not merely insufficient, it is a correctness bug: the bind
 *     appends a second copy beside the server's → `relaxingTheGateDuplicates`.
 *  3. SSR must DELIMIT a component's output so the client can find that range
 *     at all. A dynamic slot already emits `<!--$-->…<!--/$-->`; a component
 *     emits nothing → `ssrMarksSlotsButNotComponents`.
 *
 * Ordering note for whoever picks this up: (3) is already satisfied for the
 * `_mountSlot` shape, so the dynamic-slot hole is strictly closer to solvable
 * than the absorbed-component one.
 *
 * NOTE the limit is NOT introduced by `templatizeComponentChildren` — it holds
 * at DEFAULT settings for any template with a dynamic child
 * (`dynamicSlotHoleBlocksAdoptionAtDefaults`). The option widens the set of
 * templates that hit it from "templates with dynamic children" to "templates
 * with component children", which in a component-tree app is nearly all of
 * them. That is the honest statement of the cost.
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
import { _setTplAdoptTarget, _setTplAdoptVerifier } from '../template'

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

function compileApp(source: string, opts: Record<string, unknown>): () => unknown {
  const { code } = transformJSX(source, 'test.tsx', opts as never)
  const body = lowerResidualJsx(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''))
  return new Function(...DEP_NAMES, `${body}\nreturn App`)(...DEP_VALUES) as () => unknown
}

const ON = { templatizeComponentChildren: true }

/**
 * Server-render an `h()` tree, then hydrate the CLIENT emit over it and report
 * node retention.
 *
 * The SSR side is a plain `h()` tree rather than the compiled source: the
 * client emit is `_tpl(...)`, which `renderToString` cannot render. Each spec
 * asserts the produced SSR HTML so the two sides are demonstrably the same
 * page rather than assumed to be.
 *
 * A hydration throw is caught by the error boundary and still leaves a
 * plausible-looking retention number behind, from a run that never hydrated —
 * so a broken harness reads as a result. Fail loudly instead.
 */
async function hydrateAndMeasure(
  ssrTree: unknown,
  source: string,
  opts: Record<string, unknown>,
) {
  const host = document.createElement('div')
  host.innerHTML = await renderToString(ssrTree as never)
  document.body.appendChild(host)
  const ssrHtml = host.innerHTML

  const before = [...host.querySelectorAll('*')]
  const errs: string[] = []
  const realError = console.error
  console.error = (...a: unknown[]) => {
    errs.push(a.map(String).join(' '))
  }
  try {
    hydrateRoot(host, h(compileApp(source, opts) as never, null))
  } finally {
    console.error = realError
  }
  if (errs.length > 0) throw new Error(`harness broken — hydration errored: ${errs.join(' | ')}`)

  const after = new Set(host.querySelectorAll('*'))
  return {
    ssrHtml,
    retained: before.filter((n) => after.has(n)).length,
    total: before.length,
    adopts: counts['runtime.tpl.adopt'] ?? 0,
    html: host.innerHTML,
  }
}

// A three-level layout whose middle element owns a COMPONENT child, so the
// option absorbs it into the enclosing template.
const LAYOUT = `
const Leaf = () => <span class="t">leaf</span>
const Mid = () => <section class="mid"><Leaf /></section>
const App = () => <div class="app"><main class="m"><Mid /></main></div>`

/** The same page as LAYOUT, as an `h()` tree the server renderer can run. */
const layoutSsrTree = () => {
  const Leaf = () => h('span', { class: 't' }, 'leaf')
  const Mid = () => h('section', { class: 'mid' }, h(Leaf as never, null))
  const App = () => h('div', { class: 'app' }, h('main', { class: 'm' }, h(Mid as never, null)))
  return h(App as never, null)
}
const LAYOUT_HTML =
  '<div class="app"><main class="m"><section class="mid"><span class="t">leaf</span></section></main></div>'

describe('compiled-template hydration adoption — the mount-hole limit', () => {
  it('OFF: the whole skeleton adopts (4/4) — this is what the option gives up', async () => {
    // Was 3 of 4 before component-root adoption landed: the leaf template
    // swapped because only `<For>` armed the one-shot target. With the root
    // armed, every level is adopted, INCLUDING the leaf template.
    const r = await hydrateAndMeasure(layoutSsrTree(), LAYOUT, {})
    expect(r.ssrHtml).toBe(LAYOUT_HTML)
    expect([r.retained, r.total]).toEqual([4, 4])
  })

  it('ON: a component hole blocks adoption — nothing below it is kept (0/4)', async () => {
    // The template is `<div class="app"><main class="m"></main></div>`; the
    // absorbed `<Mid />` leaves `<main>` empty. The SSR DOM has a real
    // `<section class="mid">` there, which the verifier reads as an extra
    // element, so the match is rejected and the subtree is cloned + swapped.
    const r = await hydrateAndMeasure(layoutSsrTree(), LAYOUT, ON)
    expect(r.ssrHtml).toBe(LAYOUT_HTML)
    expect([r.retained, r.total]).toEqual([0, 4])
    expect(r.adopts).toBe(0)
  })

  it('ON: the rendered result is still CORRECT — a cost, not a bug', async () => {
    const r = await hydrateAndMeasure(layoutSsrTree(), LAYOUT, ON)
    expect(r.html).toBe(LAYOUT_HTML)
  })

  it('ON: an EMPTY hole DOES adopt — the cursor reaches a templatized root', async () => {
    // THE DISPROOF of "a template in component-child position is an eager
    // argument with no cursor to arm". Identical shape to the failing case
    // except the absorbed component renders nothing, so the template's element
    // tree matches the server's exactly. Adoption fires. The arming is fine;
    // the hole's CONTENT is what blocks it.
    const src = `
const Mid = () => null
const App = () => <div class="app"><main class="m"><Mid /></main></div>`
    const ssr = h(
      (() => h('div', { class: 'app' }, h('main', { class: 'm' }, null))) as never,
      null,
    )
    const r = await hydrateAndMeasure(ssr, src, ON)
    expect(r.ssrHtml).toBe('<div class="app"><main class="m"></main></div>')
    expect([r.retained, r.total]).toEqual([2, 2])
    expect(r.adopts).toBe(1)
  })

  it('the limit PRE-EXISTS at default settings for a dynamic-slot hole', async () => {
    // No option involved. A `<!>` placeholder + `_mountSlot` is the same hole
    // shape, so a template with a dynamic child does not adopt today either.
    // The option does not create this limit — it widens who hits it.
    const src = `
const App = () => <div class="a"><span class="s">s</span>{() => [1, 2].map((n) => <b>{() => String(n)}</b>)}</div>`
    const ssr = h(
      (() =>
        h('div', { class: 'a' }, h('span', { class: 's' }, 's'), () =>
          [1, 2].map((n) => h('b', null, String(n))),
        )) as never,
      null,
    )
    const r = await hydrateAndMeasure(ssr, src, {})
    expect(r.ssrHtml).toContain('<!--$-->')
    expect(r.adopts).toBe(0)
    expect(r.retained).toBe(0)
  })

  it('relaxing the verifier DUPLICATES the server content — the gate is load-bearing', () => {
    // Requirement (2). Teaching the verifier to tolerate a hole is not merely
    // insufficient; on its own it is a correctness bug, because the compiled
    // bind MOUNTS into the adopted node rather than hydrating what is there.
    // Anyone who "fixes" adoption by loosening `matchDomAgainstTemplate` alone
    // fails right here.
    const host = document.createElement('div')
    host.innerHTML = '<div class="app"><main class="m"><section class="mid">SSR</section></main></div>'
    document.body.appendChild(host)
    const target = host.firstElementChild as Element

    const Mid = () => h('section', { class: 'mid' }, 'CLIENT')
    let item: unknown
    try {
      // The verifier is a MODULE-LEVEL singleton with no getter, so a permissive
      // one installed here would leak into every later `_tpl` in this worker.
      // `hydrateRoot` re-registers the genuine verifier on each call, so the
      // restore below is a real restore rather than a hope.
      _setTplAdoptVerifier(() => true)
      _setTplAdoptTarget(target)
      item = _tpl('<div class="app"><main class="m"></main></div>', (root) => {
        const main = root.firstElementChild as HTMLElement
        return _mountChild(h(Mid as never, null), main, null) as (() => void) | null
      })
    } finally {
      _setTplAdoptTarget(null)
      const scratch = document.createElement('div')
      scratch.innerHTML = '<i>x</i>'
      hydrateRoot(scratch, h('i', null, 'x'))() // re-registers `tplAdoptVerify`
    }

    expect((item as { el: Node }).el).toBe(target) // adopted the SSR node
    expect((target as HTMLElement).outerHTML).toBe(
      '<div class="app"><main class="m">' +
        '<section class="mid">SSR</section><section class="mid">CLIENT</section></main></div>',
    )
  })

  it('the permissive verifier above did NOT leak into later templates', async () => {
    // Guards the restore in the previous spec. The verifier is module-level
    // state; if the permissive one survived, this hole would adopt and the page
    // would come back with the server's `<section class="mid">` PLUS a client
    // copy — so this asserts both the count and the resulting HTML.
    const r = await hydrateAndMeasure(layoutSsrTree(), LAYOUT, ON)
    expect(r.html).toBe(LAYOUT_HTML)
    expect(r.adopts).toBe(0)
  })

  it('SSR delimits a dynamic slot but NOT a component — requirement (3)', async () => {
    // A hole can only be hydrated if its DOM range is findable. The framework's
    // rule for an ambiguous-extent construct is to emit a range marker, and the
    // dynamic slot does. A component's output does not, so the absorbed-
    // component hole has no range to hand a hydrator even once (1) and (2) are
    // solved — which is why it is the FURTHER of the two from being closed.
    const Leaf = () => h('span', { class: 't' }, 'leaf')
    const Mid = () => h('section', { class: 'mid' }, h(Leaf as never, null))
    const WithComponent = () => h('main', { class: 'm' }, h(Mid as never, null))
    const componentHtml = await renderToString(h(WithComponent as never, null) as never)
    expect(componentHtml).toBe('<main class="m"><section class="mid"><span class="t">leaf</span></section></main>')
    expect(componentHtml).not.toContain('<!--$-->')

    const WithSlot = () =>
      h('div', { class: 'a' }, h('span', { class: 's' }, 's'), () =>
        [1, 2].map((n) => h('b', null, String(n))),
      )
    const slotHtml = await renderToString(h(WithSlot as never, null) as never)
    expect(slotHtml).toContain('<!--$-->')
    expect(slotHtml).toContain('<!--/$-->')
  })
})
