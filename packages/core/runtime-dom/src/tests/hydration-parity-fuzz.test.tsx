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
import { For, Fragment, h, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { disableHydrationWarnings, hydrateRoot, mount, onHydrationMismatch } from '../index'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)]!

type Spec =
  | { k: 'el'; tag: string; attrs: AttrSpec[]; children: Spec[] }
  | { k: 'void'; tag: string; attrs: AttrSpec[] }
  | { k: 'text'; s: string }
  | { k: 'num'; n: number }
  | { k: 'rtext'; sig: number }
  | { k: 'rattr-el'; tag: string; sig: number; children: Spec[] }
  | { k: 'show'; sig: number; child: Spec; fallback: Spec | null }
  | { k: 'ternary'; sig: number; a: Spec; b: Spec }
  | { k: 'for'; sig: number; itemTag: string }
  | { k: 'frag'; children: Spec[] }
  | { k: 'comp'; child: Spec; rsig: number }
  | { k: 'nullchild' }
  | { k: 'formctl'; ctl: 'input' | 'textarea' | 'select'; value: string; checked: boolean; opts: string[]; variant: boolean }

interface AttrSpec {
  name: string
  v: string | boolean
}

// Valid-HTML tag sets (the parser restructures invalid nesting, which no
// framework can hydrate — React warns validateDOMNesting for the same).
const FLOW_TAGS = ['div', 'section']
const PHRASING_TAGS = ['span', 'b', 'i']
const PHRASING_ONLY_PARENTS = ['p', 'h2', 'span', 'b', 'i']
const VOIDS_FLOW = ['br', 'hr', 'img', 'input']
const VOIDS_PHRASING = ['br', 'img', 'input']

interface SigSpec {
  kind: 'string' | 'bool' | 'arr'
  initial: unknown
}

function genSpec(r: () => number, depth: number, sigs: SigSpec[], phrasing = false): Spec {
  const newSig = (kind: SigSpec['kind'], initial: unknown): number => {
    sigs.push({ kind, initial })
    return sigs.length - 1
  }
  const roll = r()
  if (depth > 3 || roll < 0.14) {
    return r() < 0.7
      ? { k: 'text', s: pick(r, ['hello', 'x', 'a b', 'témû', '<&>"', '0', '']) }
      : { k: 'num', n: Math.floor(r() * 100) }
  }
  if (roll < 0.24) return { k: 'rtext', sig: newSig('string', pick(r, ['alpha', 'beta', ''])) }
  if (roll < 0.3) {
    return {
      k: 'show',
      sig: newSig('bool', r() < 0.5),
      child: genSpec(r, depth + 1, sigs, phrasing),
      fallback: r() < 0.5 ? genSpec(r, depth + 1, sigs, phrasing) : null,
    }
  }
  if (roll < 0.36) {
    return {
      k: 'ternary',
      sig: newSig('bool', r() < 0.5),
      a: genSpec(r, depth + 1, sigs, phrasing),
      b: genSpec(r, depth + 1, sigs, phrasing),
    }
  }
  if (roll < 0.44) {
    const n = 2 + Math.floor(r() * 3)
    return {
      k: 'for',
      sig: newSig('arr', Array.from({ length: n }, (_, i) => i)),
      itemTag: phrasing ? 'span' : pick(r, ['span', 'div']),
    }
  }
  if (roll < 0.5) {
    return {
      k: 'frag',
      children: Array.from({ length: 1 + Math.floor(r() * 3) }, () => genSpec(r, depth + 1, sigs, phrasing)),
    }
  }
  if (roll < 0.56 && !phrasing) {
    return { k: 'comp', child: genSpec(r, depth + 1, sigs, false), rsig: newSig('string', 'prop') }
  }
  if (roll < 0.62) {
    const tag = phrasing ? pick(r, PHRASING_TAGS) : pick(r, [...FLOW_TAGS, ...PHRASING_TAGS, 'p', 'h2'])
    const childPhrasing = PHRASING_ONLY_PARENTS.includes(tag)
    return {
      k: 'rattr-el',
      tag,
      sig: newSig('string', pick(r, ['on', 'off'])),
      children: [genSpec(r, depth + 1, sigs, childPhrasing)],
    }
  }
  if (roll < 0.68) {
    const attrs: AttrSpec[] = []
    if (r() < 0.5) attrs.push({ name: 'hidden', v: r() < 0.5 })
    if (r() < 0.5) attrs.push({ name: 'aria-selected', v: r() < 0.5 ? 'true' : 'false' })
    return { k: 'void', tag: phrasing ? pick(r, VOIDS_PHRASING) : pick(r, VOIDS_FLOW), attrs }
  }
  if (roll < 0.72) return { k: 'nullchild' }
  if (roll < 0.8) {
    // Value-bearing form controls. The generator emitted none of these before,
    // which is exactly why the attribute/property parity class below was
    // invisible to this gate. All three are PHRASING content, so they are valid
    // in every parent this grammar produces.
    const ctl = pick(r, ['input', 'textarea', 'select'] as const)
    const VALUES = ['', 'a b', '<&>"', '0', 'témû', 'v1']
    const opts = ['v1', 'v2', 'v3']
    return {
      k: 'formctl',
      ctl,
      // A select's value sometimes matches an option and sometimes does not —
      // the non-matching case is the one that leaves NOTHING marked selected.
      value: ctl === 'select' ? pick(r, [...opts, 'nomatch']) : pick(r, VALUES),
      checked: r() < 0.5,
      opts,
      // `variant` picks the ARMED shape (a control WITHOUT a masked value prop)
      // so those stay compared byte-for-byte — see KNOWN_ATTR_PARITY_DIVERGENCES.
      variant: r() < 0.35,
    }
  }
  const attrs: AttrSpec[] = []
  if (r() < 0.4) attrs.push({ name: 'class', v: 'c' + Math.floor(r() * 5) })
  const tag = phrasing ? pick(r, PHRASING_TAGS) : pick(r, [...FLOW_TAGS, ...PHRASING_TAGS, 'p', 'h2'])
  const childPhrasing = PHRASING_ONLY_PARENTS.includes(tag)
  return {
    k: 'el',
    tag,
    attrs,
    children: Array.from({ length: 1 + Math.floor(r() * 3) }, () => genSpec(r, depth + 1, sigs, childPhrasing)),
  }
}

type SigInst = ((...a: unknown[]) => unknown) & { set(v: unknown): void }
const makeSignals = (specs: SigSpec[]): SigInst[] =>
  specs.map((sp) => signal(sp.initial as never) as unknown as SigInst)

function toVNode(spec: Spec, S: SigInst[]): unknown {
  switch (spec.k) {
    case 'text':
      return spec.s
    case 'num':
      return spec.n
    case 'nullchild':
      return null
    case 'rtext':
      return () => S[spec.sig]!()
    case 'el': {
      const props: Record<string, unknown> = {}
      for (const a of spec.attrs) props[a.name] = a.v
      return h(spec.tag, props, ...(spec.children.map((c) => toVNode(c, S)) as never[]))
    }
    case 'void': {
      const props: Record<string, unknown> = {}
      for (const a of spec.attrs) props[a.name] = a.v
      return h(spec.tag, props)
    }
    case 'rattr-el':
      return h(spec.tag, { class: () => String(S[spec.sig]!()) }, ...(spec.children.map((c) => toVNode(c, S)) as never[]))
    case 'show':
      return Show({
        when: () => Boolean(S[spec.sig]!()),
        children: toVNode(spec.child, S) as never,
        ...(spec.fallback ? { fallback: toVNode(spec.fallback, S) as never } : {}),
      })
    case 'ternary':
      return () => (S[spec.sig]!() ? toVNode(spec.a, S) : toVNode(spec.b, S))
    case 'for':
      return For({
        each: () => S[spec.sig]!() as number[],
        by: (x: number) => x,
        children: (x: number) => h(spec.itemTag, { 'data-id': String(x) }, `item${x}`),
      })
    case 'frag':
      return h(Fragment, null, ...(spec.children.map((c) => toVNode(c, S)) as never[]))
    case 'comp': {
      const Comp = (props: { label: () => string; children?: unknown }) =>
        h('div', { class: 'comp' }, () => props.label(), props.children as never)
      return h(Comp, { label: () => String(S[spec.rsig]!()) }, toVNode(spec.child, S) as never)
    }
    case 'formctl': {
      // `variant` = the ARMED shape: a control carrying NO value prop, so it is
      // never masked and any future attr/prop parity break on these tags is a
      // hard failure. `checked` / `selected` are armed in BOTH shapes (they
      // agree on this h() path — see the reach caveat on the mask).
      if (spec.variant) {
        if (spec.ctl === 'input') return h('input', { checked: spec.checked })
        if (spec.ctl === 'textarea') return h('textarea', null)
        return h(
          'select',
          null,
          ...spec.opts.map((o, i) => h('option', { value: o, selected: i === 1 && spec.checked }, o) as never),
        )
      }
      // The MASKED shape: `data-pv` marks exactly the element whose value prop
      // is a known divergence, so the mask cannot reach any other element.
      if (spec.ctl === 'input') {
        return h('input', { 'data-pv': '', value: spec.value, checked: spec.checked })
      }
      if (spec.ctl === 'textarea') return h('textarea', { 'data-pv': '', value: spec.value })
      return h(
        'select',
        { 'data-pv': '', value: spec.value },
        ...spec.opts.map((o) => h('option', { value: o }, o) as never),
      )
    }
  }
}

function flip(specs: SigSpec[], S: SigInst[]): void {
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i]!
    const sig = S[i]!
    if (sp.kind === 'string') sig.set('flip' + i)
    else if (sp.kind === 'bool') sig.set(!(sp.initial as boolean))
    else {
      const arr = [...(sp.initial as number[])].reverse()
      arr.push(90 + i)
      sig.set(arr)
    }
  }
}

const stripComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '')

/**
 * Attribute/property parity divergences this gate deliberately does NOT assert.
 *
 * Each entry is a `tag.prop` whose IDL property does NOT REFLECT to a content
 * attribute (measured in Chromium, not assumed): SSR can only serialize an
 * ATTRIBUTE, while the client mount sets the PROPERTY, so the two paths produce
 * the same observable control state from different markup and a DOM-TEXT oracle
 * reports a divergence. Whether the client should ALSO write the content
 * attribute is a separate open design question — this set exists so that
 * question stays open WITHOUT leaving the whole class ungenerated (which is why
 * it was invisible here until now).
 *
 * Deleting an entry re-arms that exact shape. Everything NOT listed stays
 * armed — including `input.checked` and `option.selected`, which agree on this
 * generator's path (see the reach caveat below).
 *
 * REACH CAVEAT — this generator builds trees with `h()` (`toVNode`), never
 * through `transformJSX`, so it covers the RUNTIME path ONLY. `checked` /
 * `selected` / `indeterminate` diverge only on the COMPILED path, where the
 * compiler's `DOM_PROPS` routes them to a property assignment while
 * `applyStaticProp`'s boolean branch (props.ts) sets the ATTRIBUTE — and that
 * boolean branch fires BEFORE the `key in el` property routing. They are
 * generated and left UNMASKED here, armed against a runtime-path regression,
 * but a companion COMPILED-path gate is still owed; `compiler-integration.test.tsx`
 * is the precedent for that shape.
 */
export const KNOWN_ATTR_PARITY_DIVERGENCES: ReadonlySet<string> = new Set([
  // `input.value` and `textarea.value` were REMOVED here by this PR: the client
  // now establishes `defaultValue` on first application, so hydrated and
  // client-mounted DOM agree on the attribute and those shapes are re-armed.
  // `select.value` stays — it manifests as `<option selected>` and diverges in
  // React, Preact and Solid identically, so it is industry-normal rather than
  // ours to fix.
  'select.value',
])

/**
 * Neutralize exactly the divergences named above, and nothing else.
 *
 * Scoped by the `data-pv` marker the generator puts on precisely the elements it
 * gave a listed value prop, so an element that merely happens to carry `value`
 * or `selected` for another reason is still compared byte-for-byte.
 */
const ATTRS_AFTER_PV_INPUT = /<input data-pv=""((?: [a-zA-Z-]+="[^"]*")*)>/g
const VALUE_ATTR = / value="[^"]*"/

function maskKnownDivergences(html: string): string {
  let out = html
  if (KNOWN_ATTR_PARITY_DIVERGENCES.has('input.value')) {
    // SSR serializes `value="x"`; the client sets the non-reflecting property.
    // The attribute scan must be QUOTE-aware, not `[^>]*` — a serialized value
    // can legitimately contain `>` (`<&>"` -> `value="<&amp;>&quot;"`), which
    // truncates a naive tag match and silently stops masking.
    out = out.replace(ATTRS_AFTER_PV_INPUT, (_m, attrs: string) => `<input data-pv=""${attrs.replace(VALUE_ATTR, '')}>`)
  }
  if (KNOWN_ATTR_PARITY_DIVERGENCES.has('textarea.value')) {
    // SSR serializes the value as TEXT CONTENT; the client sets the property.
    out = out.replace(/<textarea data-pv=""([^>]*)>[\s\S]*?<\/textarea>/g, '<textarea data-pv=""$1></textarea>')
  }
  if (KNOWN_ATTR_PARITY_DIVERGENCES.has('select.value')) {
    // SSR marks the matching `<option selected>`; the client sets the property
    // post-children (applySelectValueProp). Scoped to the marked select's block.
    out = out.replace(/<select data-pv=""[\s\S]*?<\/select>/g, (block) => block.replace(/ selected=""/g, ''))
  }
  return out
}

/** The single comparison surface for O2 / O3 / O5. */
const cmp = (html: string) => maskKnownDivergences(stripComments(html))

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
    ]
    for (const html of untouched) {
      expect(maskKnownDivergences(html), `mask must not alter ${html}`).toBe(html)
    }

    // ...and it MUST neutralize the three named surfaces on marked elements.
    expect(maskKnownDivergences('<input data-pv="" value="x" checked="">')).toBe(
      '<input data-pv="" checked="">',
    )
    // A serialized value containing `>` is the case a naive `[^>]*` tag scan
    // silently fails to mask.
    expect(maskKnownDivergences('<input data-pv="" value="<&amp;>&quot;">')).toBe('<input data-pv="">')
    expect(maskKnownDivergences('<textarea data-pv="">body</textarea>')).toBe('<textarea data-pv=""></textarea>')
    expect(
      maskKnownDivergences('<select data-pv=""><option value="a" selected="">a</option></select>'),
    ).toBe('<select data-pv=""><option value="a">a</option></select>')
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
