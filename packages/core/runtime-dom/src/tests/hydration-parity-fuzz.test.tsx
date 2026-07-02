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

describe('SSR ↔ hydration parity fuzz', () => {
  const SEEDS = 300

  it(`${SEEDS} seeded trees hold all four oracles`, async () => {
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
      if (stripComments(cA.innerHTML) !== stripComments(cB.innerHTML)) {
        failures.push(`seed=${seed} O2 divergence`)
      } else {
        flip(sigSpecs, SA)
        flip(sigSpecs, SB)
        if (stripComments(cA.innerHTML) !== stripComments(cB.innerHTML)) {
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
          if (stripComments(cA.innerHTML) !== stripComments(cC.innerHTML)) {
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
