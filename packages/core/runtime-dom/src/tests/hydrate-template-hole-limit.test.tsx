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
 * Closing it needed THREE things, each still pinned by a spec here:
 *
 *  1. The adopt verifier must SKIP the DOM range belonging to a hole.
 *     `matchDomAgainstTemplate` walked every DOM element child against a flat
 *     template tag list, so hole content read as "extra elements" and the match
 *     was rejected. CLOSED: the compiler DECLARES the element it leaves empty
 *     (`data-pyreon-hole`, stripped at parse time) and the verifier skips that
 *     element's children.
 *  2. The compiled bind must HYDRATE the hole rather than MOUNT it. Relaxing
 *     (1) alone is not merely insufficient, it is a correctness bug: the bind
 *     appends a second copy beside the server's. CLOSED by threading a per-hole
 *     cursor through `_mountChild`. Still pinned by
 *     `relaxingTheGateDuplicates`, which stubs the verifier permissive and
 *     shows the duplication that results with NO hole handoff — i.e. that the
 *     hole path, not a loosened gate, is what makes (1) safe.
 *  3. The hole's server range must be DELIMITED. SSR emits no marker around a
 *     component's output and STILL DOES NOT — `ssrMarksSlotsButNotComponents`
 *     asserts that unchanged. It is not needed: a hole is always TRAILING (the
 *     compiler routes any component child with static content after it through
 *     a `<!>` placeholder, and `templateSignature` refuses every template
 *     containing one), so the element's own tag boundary supplies the extent —
 *     the same argument that makes a sole-child accessor's markers elidable.
 *     Whatever the bind does not claim is swept, which is exactly the empty
 *     element a clone would have produced.
 *
 * What is NOT closed: the DYNAMIC-SLOT hole (`<!>` + `_mountSlot`), which is a
 * pre-existing limit at DEFAULT settings for any template with a dynamic child
 * (`dynamicSlotHoleBlocksAdoptionAtDefaults`). That one has its SSR range
 * markers already but its template carries a `<!>` comment placeholder, which
 * `templateSignature` refuses outright — a different fix, in a different place.
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
  _textSlot,
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
  _textSlot,
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

  it('ON: a component hole now ADOPTS, all the way down (4/4)', async () => {
    // Was [0, 4] with 0 adopts. The template is
    // `<div class="app"><main class="m" data-pyreon-hole></main></div>`: the
    // absorbed `<Mid />` leaves `<main>` empty, and the compiler DECLARES that
    // emptiness. The verifier skips `<main>`'s server range instead of reading
    // `<section class="mid">` as an extra element, and the bind's `_mountChild`
    // hydrates that range — which recursively arms `<section>` and then the
    // leaf `<span>`, so all three templates adopt.
    const r = await hydrateAndMeasure(layoutSsrTree(), LAYOUT, ON)
    expect(r.ssrHtml).toBe(LAYOUT_HTML)
    expect([r.retained, r.total]).toEqual([4, 4])
    expect(r.adopts).toBe(3)
  })

  it('ON: the rendered result is CORRECT — adoption did not duplicate it', async () => {
    const r = await hydrateAndMeasure(layoutSsrTree(), LAYOUT, ON)
    expect(r.html).toBe(LAYOUT_HTML)
  })

  it('ON matches OFF node-for-node — the option no longer costs retention', async () => {
    // The comparison the option's cost was always about, stated directly:
    // whatever the un-templatized page keeps, the templatized one keeps too.
    const off = await hydrateAndMeasure(layoutSsrTree(), LAYOUT, {})
    const on = await hydrateAndMeasure(layoutSsrTree(), LAYOUT, ON)
    expect([on.retained, on.total]).toEqual([off.retained, off.total])
  })

  it('the hole marker never reaches the DOM', async () => {
    // It exists only inside the compiled template STRING; `_tpl` strips it from
    // the cached template before any clone or signature walk. Asserted on both
    // the adopting page and a fresh clone of the same template.
    const r = await hydrateAndMeasure(layoutSsrTree(), LAYOUT, ON)
    expect(r.html).not.toContain('data-pyreon-hole')
    expect(transformJSX(LAYOUT, 'test.tsx', ON as never).code).toContain('data-pyreon-hole')

    const csr = document.createElement('div')
    document.body.appendChild(csr)
    const item = compileApp(LAYOUT, ON)() as { el: HTMLElement }
    csr.appendChild(item.el)
    expect(csr.innerHTML).toBe(LAYOUT_HTML)
    expect(csr.innerHTML).not.toContain('data-pyreon-hole')
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

  it('a hole whose component NESTS a hole does not strand its siblings', async () => {
    // Guards the SAVE/RESTORE of the hole-cursor frame. Holes nest: the first
    // hole's component hydrates into its OWN template, whose bind installs its
    // OWN cursor map. An exit that cleared the module slot to `null` instead of
    // restoring the caller's would leave the SECOND `_mountChild` on the plain
    // mount path — appending a duplicate beside the server's copy. One hole is
    // not enough to catch that; the sibling AFTER the nested one is.
    const src = `
const Deep = () => <em class="d">d</em>
const A = () => <i class="a"><Deep /></i>
const B = () => <b class="b">b</b>
const App = () => <div class="app"><A /><B /></div>`
    const ssr = h(
      (() =>
        h(
          'div',
          { class: 'app' },
          h('i', { class: 'a' }, h('em', { class: 'd' }, 'd')),
          h('b', { class: 'b' }, 'b'),
        )) as never,
      null,
    )
    const r = await hydrateAndMeasure(ssr, src, ON)
    expect(r.ssrHtml).toBe(
      '<div class="app"><i class="a"><em class="d">d</em></i><b class="b">b</b></div>',
    )
    expect(r.html).toBe(r.ssrHtml)
    expect([r.retained, r.total]).toEqual([4, 4])
  })

  it('sweeps server content the client render did not claim', async () => {
    // The server sent one more child than the client renders. Without the
    // sweep the surplus stays in the adopted element — visible stale content
    // that a clone-and-swap would never have produced.
    const src = `
const A = () => <i class="a">a</i>
const App = () => <div class="app"><A /></div>`
    const ssr = h(
      (() => h('div', { class: 'app' }, h('i', { class: 'a' }, 'a'), h('b', null, 'extra'))) as never,
      null,
    )
    const r = await hydrateAndMeasure(ssr, src, ON)
    expect(r.ssrHtml).toBe('<div class="app"><i class="a">a</i><b>extra</b></div>')
    expect(r.html).toBe('<div class="app"><i class="a">a</i></div>')
  })

  it('a hole the bind never fills is swept to the clone-equivalent empty element', async () => {
    // The mis-declared-hole safety property, stated as a test. `<App />` here
    // has NO component child at all once the server's is gone, so nothing
    // mounts into the hole — and the correct client DOM for an element the
    // template leaves empty is an EMPTY element. The sweep is what makes a
    // wrong declaration cost an adoption instead of correctness, so it is
    // asserted directly rather than left as an argument.
    const host = document.createElement('div')
    host.innerHTML = '<div class="app"><i>stale</i></div>'
    document.body.appendChild(host)
    const target = host.firstElementChild as Element
    const Empty = () => _tpl('<div class="app" data-pyreon-hole></div>', () => null)
    hydrateRoot(host, h(Empty as never, null))
    expect(target.outerHTML).toBe('<div class="app"></div>')
  })

  it('a hole child that MISMATCHES the server RECOVERS instead of vanishing', () => {
    // The hole's cursor doubles as the ANCHOR, and this is why. `hydrateElement`
    // recovers from a tag mismatch with `mountChild(vnode, parent, anchor)`, and
    // a `null` anchor means APPEND — past the unclaimed server content, which
    // the sweep then deletes along with the recovery, so the page renders
    // NOTHING. Anchoring on the cursor puts the recovery before the content it
    // replaces.
    //
    // Hand-written in the shape the compiler emits, because reaching this branch
    // needs the hole's child to be a PLAIN element vnode: a compiled component
    // returns a `_tpl` NativeItem, which `hydrateChild` recovers via
    // `replaceChild` and never consults the anchor at all. (The first version of
    // this spec used a compiled component and passed against the broken state.)
    const host = document.createElement('div')
    host.innerHTML = '<div class="app"><i class="m">m</i></div>'
    document.body.appendChild(host)
    const App = () =>
      _tpl('<div class="app" data-pyreon-hole></div>', (root) =>
        _mountChild(h('b', { class: 'm' }, 'm'), root, null),
      )
    const realWarn = console.warn
    console.warn = () => {} // a tag mismatch legitimately warns
    try {
      hydrateRoot(host, h(App as never, null))
    } finally {
      console.warn = realWarn
    }
    expect(host.innerHTML).toBe('<div class="app"><b class="m">m</b></div>')
  })

  it('a <For> absorbed into a hole hydrates its rows normally', async () => {
    // The option absorbs control-flow components too — deliberately, since
    // excluding them by NAME would paper over the gated case and leave the
    // general one. So `<For>` is a shape the hole path newly has to carry: the
    // cursor it hands `hydrateChild` lands on the list's `<!--pyreon-for-->`
    // marker, and the row-adoption machinery takes it from there.
    const src = `
const App = () => <ul class="l"><For each={["a","b"]} by={(x) => x}>{(x) => <li>{() => x}</li>}</For></ul>`
    const tree = h(
      (() =>
        h(
          'ul',
          { class: 'l' },
          h(For as never, { each: ['a', 'b'], by: (x: string) => x } as never, ((x: string) =>
            h('li', null, () => x)) as never),
        )) as never,
      null,
    )
    const off = await hydrateAndMeasure(tree, src, {})
    const on = await hydrateAndMeasure(tree, src, ON)
    expect(on.html).toBe(off.html)
    expect([on.retained, on.total]).toEqual([off.retained, off.total])
    // The `<ul>` template itself adopts on top of the rows, so ON adopts MORE.
    expect(on.adopts).toBeGreaterThan(off.adopts)
  })

  it('a component with a STATIC sibling BEFORE it adopts in full (4/4 both ways)', async () => {
    // This shape used to be the honest limit of the mount-hole fix, measured at
    // 3/4 OFF → 0/4 ON, then 3/4 OFF → 4/4 ON. Deferred `_tpl` builds during
    // hydration closed the OFF gap too: the component-output `_tpl` that used
    // to clone (its build ran before the walk reached its cursor) now defers
    // and adopts at its real cursor, so OFF retains 4/4 as well. The load-
    // bearing invariants are unchanged: ON never retains LESS than OFF, and
    // both render the same page.
    //
    // A hole is marker-free because it is TRAILING, and putting static content
    // BEFORE a component does not change that — everything from the last baked
    // child to the element's own closing tag still belongs to the hole. So the
    // compiler keeps appending (`_mountChild`, no `<!>`), bakes the static
    // sibling into the template, and declares the hole; the verifier matches the
    // baked children first and starts the hole cursor after them. No SSR byte
    // moved to make that work.
    //
    // What is NOT covered is static content AFTER a component, where the extent
    // genuinely would need a marker. Those shapes bail to `h()` instead — see
    // the `<!>`-free spec below — so they behave exactly as they do with the
    // option off, which is what lets the option default ON without regressing
    // anything.
    const MIXED = `
const Mid = () => <section class="mid">m</section>
const App = () => <div class="app"><main class="m"><span class="s">s</span><Mid /></main></div>`
    const tree = () => {
      const M = () => h('section', { class: 'mid' }, 'm')
      const A = () =>
        h(
          'div',
          { class: 'app' },
          h('main', { class: 'm' }, h('span', { class: 's' }, 's'), h(M as never, null)),
        )
      return h(A as never, null)
    }
    const off = await hydrateAndMeasure(tree(), MIXED, {})
    const on = await hydrateAndMeasure(tree(), MIXED, ON)
    expect([off.retained, off.total]).toEqual([4, 4])
    expect([on.retained, on.total]).toEqual([4, 4])
    // Both render the same page — the retention is a gain, not a divergence.
    expect(on.html).toBe(off.html)
    // The append path, and a hole declared on the element that ends short.
    const code = transformJSX(MIXED, 'test.tsx', ON as never).code
    expect(code).not.toContain('_mountSlot')
    expect(code).toContain('<main class=\\"m\\" data-pyreon-hole><span class=\\"s\\">s</span></main>')
  })

  it('static content AFTER a component BAILS to h() rather than emitting a hole', async () => {
    // The other half of the trailing rule, and the reason the option is safe to
    // default on. Here the extent really would need a marker, so the compiler
    // declines to templatize the element at all — byte-identical to the option
    // being off, which is the one outcome that cannot regress anything.
    const AFTER = `
const Mid = () => <section class="mid">m</section>
const App = () => <div class="app"><main class="m"><Mid /><span class="s">s</span></main></div>`
    const tree = () => {
      const M = () => h('section', { class: 'mid' }, 'm')
      const A = () =>
        h(
          'div',
          { class: 'app' },
          h('main', { class: 'm' }, h(M as never, null), h('span', { class: 's' }, 's')),
        )
      return h(A as never, null)
    }
    const off = await hydrateAndMeasure(tree(), AFTER, {})
    const on = await hydrateAndMeasure(tree(), AFTER, ON)
    expect(on.html).toBe(off.html)
    expect([on.retained, on.total]).toEqual([off.retained, off.total])
    // Same emit both ways — the option is a no-op for this shape.
    expect(transformJSX(AFTER, 'test.tsx', ON as never).code).toBe(
      transformJSX(AFTER, 'test.tsx', {} as never).code,
    )
  })

  // ── the never-worse gate ───────────────────────────────────────────────────
  // The default flip rests on one claim: turning the option ON cannot make any
  // shape hydrate worse than leaving it OFF. Individual specs pin the shapes we
  // thought of; this walks the combinatoric space between them.
  //
  // Each seed builds one child list over {static element, component, text} and
  // renders it two ways — the compiled emit with the option ON and with it OFF —
  // over the same server HTML, then asserts the two invariants that licence the
  // default: the page is IDENTICAL, and retention never DROPS. A shape the
  // compiler declines to absorb scores equal (it emits the OFF code verbatim);
  // a shape it absorbs scores higher.
  it('300 seeded child lists: ON renders identically and never retains less', async () => {
    const rand = (seed: number) => {
      let x = seed + 0x9e3779b9
      return () => {
        x ^= x << 13
        x ^= x >>> 17
        x ^= x << 5
        return ((x >>> 0) % 1000) / 1000
      }
    }
    const failures: string[] = []
    for (let seed = 1; seed <= 300; seed++) {
      const r = rand(seed)
      const n = 1 + Math.floor(r() * 4)
      // 0 = static element, 1 = component, 2 = text.
      const kinds = Array.from({ length: n }, () => Math.floor(r() * 3))
      // At least one component, or the option has nothing to decide about.
      if (!kinds.includes(1)) kinds[Math.floor(r() * n)] = 1

      const defs: string[] = []
      const jsxKids: string[] = []
      const hKids: unknown[] = []
      kinds.forEach((k, i) => {
        if (k === 0) {
          jsxKids.push(`<span class="s${i}">s${i}</span>`)
          hKids.push(h('span', { class: `s${i}` }, `s${i}`))
        } else if (k === 1) {
          defs.push(`const C${i} = () => <section class="c${i}">c${i}</section>`)
          jsxKids.push(`<C${i} />`)
          const C = () => h('section', { class: `c${i}` }, `c${i}`)
          hKids.push(h(C as never, null))
        } else {
          jsxKids.push(`t${i}`)
          hKids.push(`t${i}`)
        }
      })
      const src = `${defs.join('\n')}
const App = () => <div class="app"><main class="m">${jsxKids.join('')}</main></div>`
      const tree = () =>
        h('div', { class: 'app' }, h('main', { class: 'm' }, ...(hKids as never[])))

      const off = await hydrateAndMeasure(tree(), src, {})
      const on = await hydrateAndMeasure(tree(), src, ON)
      if (on.html !== off.html) {
        failures.push(`seed=${seed} [${kinds.join(',')}] DOM diverged\n  off=${off.html}\n  on =${on.html}`)
      } else if (on.retained < off.retained) {
        failures.push(
          `seed=${seed} [${kinds.join(',')}] retention REGRESSED ${off.retained}/${off.total} → ${on.retained}/${on.total}`,
        )
      }
      if (failures.length >= 3) break
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  it('a dynamic-slot template adopts, and does so INDEPENDENTLY of the option', async () => {
    // Was `the limit PRE-EXISTS at default settings for a dynamic-slot hole`,
    // asserting `adopts === 0 / retained === 0`. That recorded the state of the
    // world when a `<!>`-bearing template could never adopt at all
    // (`templateSignature` bailed on `html.includes('<!')`), and its POINT was
    // an attribution one: the dynamic-slot limit is not created by
    // `templatizeComponentChildren`, which merely widens who hits it.
    //
    // The mount-slot adoption work removed that blanket bail, so the shape now
    // ADOPTS. The attribution invariant is the half worth keeping and is still
    // true — the option does not govern this shape — so it is asserted directly
    // (off vs on) instead of via a zero that no longer holds.
    const src = `
const App = () => <div class="a"><span class="s">s</span>{() => [1, 2].map((n) => <b>{() => String(n)}</b>)}</div>`
    const tree = () =>
      h(
        (() =>
          h('div', { class: 'a' }, h('span', { class: 's' }, 's'), () =>
            [1, 2].map((n) => h('b', null, String(n))),
          )) as never,
        null,
      )
    const off = await hydrateAndMeasure(tree(), src, {})
    expect(off.ssrHtml).toContain('<!--$-->')
    expect(off.adopts).toBe(1)
    expect(off.retained).toBe(off.total)

    // The option is not what decides this shape: identical adoption, identical
    // retention, identical page. `adopts` is a per-TEST cumulative counter, so
    // the second run's contribution is the delta.
    const on = await hydrateAndMeasure(tree(), src, ON)
    expect(on.adopts - off.adopts).toBe(off.adopts)
    expect(on.retained).toBe(off.retained)
    expect(on.html).toBe(off.html)
  })

  it('a HOLE and a SLOT in one template stay disjoint — neither duplicates', async () => {
    // The shape that only became reachable when mount-slot adoption removed
    // `templateSignature`'s blanket `html.includes('<!')` bail. Before that, a
    // template carrying a `<!>` never adopted at all, so a hole could never
    // co-occur with one — which is exactly what the hole relaxation's original
    // soundness note leaned on ("`templateSignature` refuses every template
    // containing one").
    //
    // Both relaxations say "this element's whole server child range belongs to
    // a later claimer, stop verifying here". If they ever fired on the SAME
    // element the range would be handed to `_mountChild` AND `_mountSlot` —
    // duplicate DOM. They cannot: a hole is recorded only for an element with
    // no text, no element child and no `<!>`. This locks that they compose on
    // one template without either claim leaking into the other.
    const src = `
const Mid = () => <em class="mid">m</em>
const App = () => <div class="a"><section class="h"><Mid /></section>{() => [1, 2].map((n) => <b>{() => String(n)}</b>)}</div>`
    const tree = () => {
      const Mid = () => h('em', { class: 'mid' }, 'm')
      return h(
        (() =>
          h(
            'div',
            { class: 'a' },
            h('section', { class: 'h' }, h(Mid as never, null)),
            () => [1, 2].map((n) => h('b', null, String(n))),
          )) as never,
        null,
      )
    }
    const r = await hydrateAndMeasure(tree(), src, ON)
    // The server sent both regions.
    expect(r.ssrHtml).toContain('<em class="mid">m</em>')
    expect(r.ssrHtml).toContain('<!--$-->')
    // Exactly one of each — no second copy from either claimer. This is the
    // assertion that would fail if the two relaxations overlapped.
    expect(r.html.match(/<em/g)).toHaveLength(1)
    expect(r.html.match(/<b>/g)).toHaveLength(2)
    expect(r.html.match(/<section/g)).toHaveLength(1)
    // …and the page still renders the same content it was sent.
    expect(r.html).toContain('<em class="mid">m</em>')
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
    // state; if the permissive one survived, this page would adopt WITHOUT the
    // hole handoff — `_tplPendingHoles` stays null under a stub verifier — and
    // come back with the server's `<section class="mid">` PLUS a client copy.
    // Asserting the HTML is what catches that; the adopt count only proves the
    // genuine verifier ran.
    const r = await hydrateAndMeasure(layoutSsrTree(), LAYOUT, ON)
    expect(r.html).toBe(LAYOUT_HTML)
    expect(r.adopts).toBe(3)
  })

  it('SSR still delimits a dynamic slot but NOT a component — requirement (3)', async () => {
    // Unchanged, deliberately: closing the hole added ZERO bytes to SSR output.
    // The framework's rule is to emit a range marker for an AMBIGUOUS extent,
    // and a trailing hole's extent is not ambiguous — it runs to the end of its
    // parent element. This spec is the guard on that: if a component's output
    // ever gains markers, the hole path's "skip to the end" would be reading a
    // range someone else now owns, and the cost would land on every hydrated
    // page (see the marker-cost decomposition in examples/benchmark).
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
