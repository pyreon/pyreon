/**
 * SSR ↔ hydration parity fuzz gate — the hydration sibling of the compiler's
 * fuzz-equivalence and the reconciler's property-fuzz gates.
 *
 * Every seeded tree is built TWICE with independent, identically-initialized
 * signal sets: instance A renders on the server and hydrates over its own
 * HTML; instance B mounts fresh on the client. Four oracles:
 *
 *   O1 zero-mismatch : hydrating a tree over ITS OWN SSR output fires no
 *                      onHydrationMismatch events.
 *   O2 DOM parity    : comment-normalized innerHTML(A) === innerHTML(B).
 *   O3 reactivity    : after identical signal flips on both instances the
 *                      DOM still matches (bindings landed on the right nodes).
 *   O4 DOM reuse     : the root element identity survives hydration.
 *   O5 ground truth  : a THIRD instance mounted FRESH with the flipped
 *                      initial values matches the flipped A/B DOM —
 *                      catches "agreement on broken" where hydrated and
 *                      client-mounted bindings share the same wrong
 *                      post-flip behavior (this caught the text→VNode
 *                      "[object Object]" binding during development).
 *
 * The 2026-07 discovery campaign this gate distills found FIVE shipped bug
 * classes (each now locked by the minimal specs below + this gate):
 *   1. <For> hydration duplicated every row (fresh-mounted rows while the
 *      SSR block stayed in the DOM) and returned a null sibling cursor.
 *   2. Adjacent text-producing children — merged into ONE text node by the
 *      HTML parser — misaligned the cursor and duplicated text.
 *   3. Reactive accessor children with a MULTI-ROOT initial (fragment /
 *      component subtree) removed only ONE SSR node before re-mounting.
 *   4. Empty-initial reactive text mis-anchored its recovery mount at the
 *      parent anchor, corrupting sibling ORDER.
 *   5. `mountChildren`'s sole-text-child `textContent =` fast path WIPED all
 *      existing siblings when reached via a Fragment (a pure client-mount
 *      bug, caught by the O2 parity oracle — hydration preserved the SSR
 *      DOM; the client mount lost content).
 * Fixes: SSR wraps accessor output in `<!--$-->…<!--/$-->` range markers
 * (renderNode/streamNode); hydration consumes ranges + the bounded
 * `<!--pyreon-for-->` block, adopts merged text via splitText, and recovers
 * at the cursor; the textContent fast path requires an EMPTY parent.
 *
 * The grammar generates VALID HTML nesting only — the HTML parser
 * restructures invalid nesting (`<p><h2>`), which no framework can hydrate.
 */
import { renderToString } from '@pyreon/runtime-server'
import { disableHydrationWarnings, hydrateRoot, mount, onHydrationMismatch } from '../index'
import { For, Fragment, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import {
  KNOWN_ATTR_PARITY_DIVERGENCES,
  cmp,
  flip,
  genSpec,
  makeSignals,
  maskKnownDivergences,
  mulberry32,
  stripComments,
  toVNode,
  type SigInst,
  type SigSpec,
  type Spec,
} from './_hydration-fuzz-grammar'
// Re-exported: deleting an entry here re-arms that exact shape (see the mask docblock).
export { KNOWN_ATTR_PARITY_DIVERGENCES }

describe('SSR ↔ hydration parity fuzz', () => {
  // CI runs 300 (the gate's standing budget). A marker-scheme change must be
  // proven at a far higher count before it ships — the value-conditional
  // scheme that regressed here failed 83 of 5000 seeds, a rate a 300-seed run
  // can miss entirely. Override with PYREON_FUZZ_SEEDS=5000.
  const SEEDS = Math.max(1, Number((process.env as Record<string, string | undefined>).PYREON_FUZZ_SEEDS) || 300)

  // The wall-clock backstop must EXCEED the work, and the work is linear in
  // SEEDS (~1.7ms/seed on a loaded machine). Deriving it from the same
  // constant keeps an override from dying on vitest's 20s default and being
  // misread as an oracle failure — which is exactly what a 20000-seed run did.
  const TIMEOUT_MS = Math.max(20_000, SEEDS * 12)
  it(`${SEEDS} seeded trees hold all four oracles`, { timeout: TIMEOUT_MS }, async () => {
    disableHydrationWarnings()
    const failures: string[] = []

    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = mulberry32(seed)
      const sigSpecs: SigSpec[] = []
      const spec: Spec = {
        k: 'el',
        tag: 'main',
        attrs: [],
        children: [genSpec(r, 0, sigSpecs), genSpec(r, 0, sigSpecs)],
      }

      const SA = makeSignals(sigSpecs)
      const html = await renderToString(toVNode(spec, SA) as never)
      const cA = document.createElement('div')
      document.body.appendChild(cA)
      cA.innerHTML = html
      const rootBefore = cA.firstElementChild
      const mismatches: string[] = []
      const off = onHydrationMismatch((ctx) => mismatches.push(`${ctx.type}@${ctx.path}`))
      const cleanupA = hydrateRoot(cA, toVNode(spec, SA) as never)
      off()

      const SB = makeSignals(sigSpecs)
      const cB = document.createElement('div')
      document.body.appendChild(cB)
      const cleanupB = mount(toVNode(spec, SB) as never, cB)

      if (mismatches.length > 0) failures.push(`seed=${seed} O1: ${mismatches[0]}`)
      else if (cA.firstElementChild !== rootBefore) failures.push(`seed=${seed} O4: root remounted`)
      if (cmp(cA.innerHTML) !== cmp(cB.innerHTML)) {
        failures.push(`seed=${seed} O2 divergence`)
      } else {
        flip(sigSpecs, SA)
        flip(sigSpecs, SB)
        if (cmp(cA.innerHTML) !== cmp(cB.innerHTML)) {
          failures.push(`seed=${seed} O3 post-flip divergence`)
        } else {
          // O5 — absolute ground truth: fresh signals, flipped BEFORE
          // mounting, fresh mount. A hydrated/client pair that agrees with
          // each other but not with this is agreeing on broken bindings.
          const SC = makeSignals(sigSpecs)
          flip(sigSpecs, SC)
          const cC = document.createElement('div')
          document.body.appendChild(cC)
          const cleanupC = mount(toVNode(spec, SC) as never, cC)
          if (cmp(cA.innerHTML) !== cmp(cC.innerHTML)) {
            failures.push(`seed=${seed} O5 ground-truth divergence`)
          }
          cleanupC()
          cC.remove()
        }
      }

      cleanupA()
      cleanupB()
      cA.remove()
      cB.remove()
      if (failures.length >= 5) break
    }

    expect(failures, failures.join('\n')).toEqual([])
  })
})

describe('grammar non-vacuity', () => {
  // A generator arm that stops firing turns this gate green by generating
  // NOTHING, which is how the whole value-bearing-control class stayed
  // invisible here in the first place. Count the shapes and assert a floor, so
  // "the arm produces no controls" fails loudly instead of passing quietly.
  const walk = (spec: Spec, hit: (key: string) => void): void => {
    switch (spec.k) {
      case 'formctl':
        if (spec.variant) {
          if (spec.ctl === 'input') hit('armed input.checked')
          else if (spec.ctl === 'select') hit('armed option.selected')
          else hit('armed textarea (no value)')
        } else {
          hit(`${spec.ctl}.value`)
          if (spec.ctl === 'input') hit('input.checked')
          if (spec.ctl === 'select') hit('option.selected (via select.value)')
        }
        return
      case 'el':
      case 'frag':
      case 'rattr-el':
        for (const c of spec.children) walk(c, hit)
        return
      case 'show':
        walk(spec.child, hit)
        if (spec.fallback) walk(spec.fallback, hit)
        return
      case 'ternary':
        walk(spec.a, hit)
        walk(spec.b, hit)
        return
      case 'comp':
        walk(spec.child, hit)
        return
      default:
        return
    }
  }

  it('the divergence mask does not over-reach', () => {
    // The mask is the one place this gate deliberately stops asserting, so its
    // BLAST RADIUS is itself a contract: it may only touch elements the
    // generator marked with `data-pv`, and only the three named props.
    const untouched = [
      // an UNMARKED input keeps its value attribute
      '<input value="x">',
      // `checked` is armed, on marked and unmarked elements alike
      '<input data-pv="" checked="">',
      '<input checked="">',
      // an UNMARKED select keeps its selected option
      '<select><option value="a" selected="">a</option></select>',
      // an unmarked textarea keeps its content
      '<textarea>body</textarea>',
      // RE-ARMED by this PR: the client now establishes `defaultValue` on first
      // application, so hydrated and client-mounted DOM agree on `value` and
      // these shapes are compared byte-for-byte again — even when MARKED.
      '<input data-pv="" value="x">',
      '<textarea data-pv="">body</textarea>',
    ]
    for (const html of untouched) {
      expect(maskKnownDivergences(html), `mask must not alter ${html}`).toBe(html)
    }

    // ...and it MUST still neutralize the ONE surface that remains named.
    // `select.value` manifests as `<option selected>` and diverges identically
    // in React, Preact and Solid, so it stays masked as industry-normal.
    expect(
      maskKnownDivergences('<select data-pv=""><option value="a" selected="">a</option></select>'),
    ).toBe('<select data-pv=""><option value="a">a</option></select>')

    // The `>`-in-value case is kept as a NEGATIVE now: a naive `[^>]*` tag scan
    // would still mangle it, and with input.value re-armed the mask must leave
    // it entirely alone rather than half-strip it.
    expect(maskKnownDivergences('<input data-pv="" value="<&amp;>&quot;">')).toBe(
      '<input data-pv="" value="<&amp;>&quot;">',
    )
  })

  it('value-bearing form controls appear in a meaningful share of seeds', () => {
    const CENSUS_SEEDS = 5000
    const counts = new Map<string, number>()
    let seedsWithControl = 0
    for (let seed = 1; seed <= CENSUS_SEEDS; seed++) {
      const r = mulberry32(seed)
      const sigSpecs: SigSpec[] = []
      const spec: Spec = {
        k: 'el',
        tag: 'main',
        attrs: [],
        children: [genSpec(r, 0, sigSpecs), genSpec(r, 0, sigSpecs)],
      }
      let n = 0
      walk(spec, (key) => {
        counts.set(key, (counts.get(key) ?? 0) + 1)
        n++
      })
      if (n > 0) seedsWithControl++
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0)
    const summary = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' · ')
    const share = seedsWithControl / CENSUS_SEEDS

    // Floors, not exact counts: the grammar may legitimately be extended, but it
    // must never silently stop producing these shapes.
    expect(
      share,
      `only ${(share * 100).toFixed(1)}% of seeds carry a form control (${total} total: ${summary})`,
    ).toBeGreaterThan(0.2)
    // Every masked surface AND every armed surface must actually be generated.
    for (const key of ['input.value', 'textarea.value', 'select.value', 'input.checked', 'armed option.selected']) {
      expect(counts.get(key) ?? 0, `grammar generated no ${key}`).toBeGreaterThan(0)
    }
  })
})

describe('hydration regression locks (minimal shapes from the campaign)', () => {
  const mountPair = async (make: (S: { get(i: number): SigInst }) => unknown, sigs: unknown[]) => {
    const mk = () => {
      const insts = sigs.map((v) => signal(v as never) as unknown as SigInst)
      return { get: (i: number) => insts[i]!, insts }
    }
    const A = mk()
    const html = await renderToString(make(A) as never)
    const cA = document.createElement('div')
    document.body.appendChild(cA)
    cA.innerHTML = html
    const mismatches: string[] = []
    const off = onHydrationMismatch((ctx) => mismatches.push(ctx.type))
    const cleanupA = hydrateRoot(cA, make(A) as never)
    off()
    const B = mk()
    const cB = document.createElement('div')
    document.body.appendChild(cB)
    const cleanupB = mount(make(B) as never, cB)
    return { html, cA, cB, A, B, mismatches, done: () => (cleanupA(), cleanupB(), cA.remove(), cB.remove()) }
  }

  it('1. <For> hydrates without duplicating rows, and the sibling cursor survives', async () => {
    disableHydrationWarnings()
    const { cA, mismatches, done } = await mountPair(
      (S) =>
        h(
          'div',
          null,
          For({
            each: () => S.get(0)() as number[],
            by: (x: number) => x,
            children: (x: number) => h('span', null, `r${x}`),
          }),
          h('b', null, 'tail'),
        ),
      [[1, 2, 3]],
    )
    expect(cA.querySelectorAll('span').length).toBe(3) // pre-fix: 6 (duplicated)
    expect(cA.querySelector('b')!.textContent).toBe('tail') // pre-fix cursor loss → mismatch
    expect(mismatches).toEqual([])
    done()
  })

  it('2. adjacent text-producing children survive parser text-merging (splitText adoption)', async () => {
    disableHydrationWarnings()
    const { cA, cB, mismatches, done } = await mountPair(
      () => h('div', null, 23, 'hello'),
      [],
    )
    expect(mismatches).toEqual([])
    expect(stripComments(cA.innerHTML)).toBe(stripComments(cB.innerHTML))
    expect(cA.querySelector('div')!.textContent).toBe('23hello') // pre-fix: '23hello' + dupes
    done()
  })

  it('3. accessor child with a MULTI-ROOT (fragment) initial swaps its whole SSR range', async () => {
    disableHydrationWarnings()
    const { cA, cB, mismatches, done } = await mountPair(
      (S) =>
        h(
          'div',
          null,
          () => (S.get(0)() ? h(Fragment, null, 'A', 'B', h('b', null, 'C')) : null),
          h('i', null, 'tail'),
        ),
      [true],
    )
    expect(mismatches).toEqual([])
    expect(stripComments(cA.innerHTML)).toBe(stripComments(cB.innerHTML)) // pre-fix: 'AB' duplicated
    done()
  })

  it('4. empty-initial reactive text keeps sibling ORDER (binding anchored at the cursor)', async () => {
    disableHydrationWarnings()
    const { cA, A, done } = await mountPair(
      (S) => h('main', null, () => String(S.get(0)()), h('hr', null)),
      [''],
    )
    ;(A.get(0) as SigInst).set('flip')
    // pre-fix the binding was appended after <hr> → '<hr>flip'
    expect(stripComments(cA.innerHTML)).toBe('<main>flip<hr></main>')
    done()
  })

  it('5. a Fragment whose sole child is text does NOT wipe existing siblings (client mount)', () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    mount(h('i', null, 'head', h(Fragment, null, 'X')) as never, c)
    expect(c.innerHTML).toBe('<i>headX</i>') // pre-fix: '<i>X</i>' (head wiped)
    c.remove()
  })

  it('7. reactive accessor: fragment-of-static-text → text flip removes the old text (client)', () => {
    // Pre-existing (independent of SSR): a static-text child mounted inside a
    // reactive boundary returned a `noop` cleanup, so flipping an accessor
    // from a fragment-of-text to another value ORPHANED the old text
    // (`() => f() ? <>a b</> : 'X'` flipped to 'X' → "abX"). Fuzz-found via
    // the O5 ground-truth oracle. Now the static-text cleanup removes its
    // node at reactive-boundary depth.
    const f = signal(true)
    const c = document.createElement('div')
    document.body.appendChild(c)
    mount(h('main', null, () => (f() ? h(Fragment, null, 'a', 'b') : 'X')) as never, c)
    expect(stripComments(c.innerHTML)).toBe('<main>ab</main>')
    f.set(false)
    expect(stripComments(c.innerHTML)).toBe('<main>X</main>') // pre-fix: 'abX'
    c.remove()
  })

  it('8. reactive accessor: text → VNode flip does not stringify the VNode (client)', () => {
    // Pre-existing: the reactive-text fast path did `text.data = String(v)`
    // unconditionally, rendering "[object Object]" when the accessor later
    // yielded a VNode. bindPolymorphicText upgrades to a subtree mount.
    const f = signal(false)
    const c = document.createElement('div')
    document.body.appendChild(c)
    mount(h('main', null, () => (f() ? h('span', null, 'X') : 'txt')) as never, c)
    expect(stripComments(c.innerHTML)).toBe('<main>txt</main>')
    f.set(true)
    expect(stripComments(c.innerHTML)).toBe('<main><span>X</span></main>') // pre-fix: '[object Object]'
    c.remove()
  })

  it('6. genuine text mismatch recovers IN PLACE (adopt + overwrite, no double-mount)', async () => {
    disableHydrationWarnings()
    const Comp = (props: { name: () => string }) => h('div', null, () => props.name())
    const html = await renderToString(h(Comp, { name: () => 'Alice' }))
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.innerHTML = html
    const name = signal('Bob')
    const cleanup = hydrateRoot(el, h(Comp, { name: () => name() }))
    expect(el.querySelector('div')!.textContent).toBe('Bob')
    name.set('Charlie')
    expect(el.querySelector('div')!.textContent).toBe('Charlie')
    cleanup()
    el.remove()
  })
})
