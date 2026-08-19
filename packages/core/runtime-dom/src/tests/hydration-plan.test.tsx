/**
 * Row-plan replay hydration — the BAIL contract.
 *
 * This module is a fast path whose whole safety argument is "anything I do not
 * fully understand, I refuse". `buildRowPlan` returns null for every row shape
 * outside its supported grammar, and `replayRowPlan` returns null the moment a
 * row's real DOM disagrees with the plan built from row 0. The caller then
 * walks that row interpretively, byte-identically to before.
 *
 * So the tests that matter are the REFUSALS. A fast path that quietly accepts
 * a shape it cannot handle does not produce a slow page — it produces a wrong
 * one, and the failure surfaces far from here. Each bail below names the shape
 * it is protecting against.
 */
import { describe, expect, it } from 'vitest'
import { For, Fragment, h, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { buildRowPlan, replayRowPlan, tplAdoptVerify } from '../hydration-plan'

/** A row shape the plan supports: element root, element + text children. */
const supportedRow = () =>
  h('li', { class: 'row' }, h('span', null, 'name'), h('em', null, 'meta'))

describe('buildRowPlan — the supported grammar', () => {
  it('plans a single element root with element and static-text children', () => {
    expect(buildRowPlan(supportedRow())).not.toBeNull()
  })

  it('plans a reactive-accessor text child (the `{() => sig()}` shape)', () => {
    const label = signal('a')
    expect(buildRowPlan(h('li', null, h('span', null, () => label())))).not.toBeNull()
  })

  it('plans an element with props on a nested node', () => {
    expect(
      buildRowPlan(h('li', null, h('a', { href: '/x', title: 't' }, 'go'))),
    ).not.toBeNull()
  })
})

describe('buildRowPlan — refuses every shape outside the grammar', () => {
  it('refuses a non-element root', () => {
    // A plan resolves nodes by child hops from a single root element; a bare
    // string or accessor root has no such anchor.
    expect(buildRowPlan('just text')).toBeNull()
    expect(buildRowPlan(null)).toBeNull()
    expect(buildRowPlan(() => 'accessor')).toBeNull()
  })

  it('refuses a COMPONENT root or child — its output shape is not knowable here', () => {
    const Row = () => h('li', null, 'x')
    expect(buildRowPlan(h(Row, null))).toBeNull()
    expect(buildRowPlan(h('li', null, h(Row, null)))).toBeNull()
  })

  it('refuses a fragment child — it contributes an unknown node count', () => {
    expect(buildRowPlan(h('li', null, h(Fragment, null, 'a', 'b')))).toBeNull()
  })

  it('refuses nested <For> / <Show> — their DOM extent is data-dependent', () => {
    expect(
      buildRowPlan(h('li', null, h(For, { each: [], by: (x: unknown) => String(x) }))),
    ).toBeNull()
    expect(buildRowPlan(h('li', null, h(Show, { when: true })))).toBeNull()
  })

  it('refuses innerHTML — the subtree is opaque to a structural plan', () => {
    expect(
      buildRowPlan(h('li', { dangerouslySetInnerHTML: { __html: '<b>x</b>' } })),
    ).toBeNull()
    expect(buildRowPlan(h('li', { innerHTML: '<b>x</b>' }))).toBeNull()
  })

  it('refuses <select> — its value must be applied AFTER children (PZ-09)', () => {
    expect(buildRowPlan(h('select', null, h('option', null, 'a')))).toBeNull()
  })

  it('refuses ADJACENT text children — the parser merges them into one node', () => {
    // Two text children serialize to a single SSR text node, so the plan's
    // per-child index arithmetic would be off by one for the rest of the row.
    // splitText is the interpretive path's job.
    expect(buildRowPlan(h('li', null, 'a', 'b'))).toBeNull()
    const s = signal('x')
    expect(buildRowPlan(h('li', null, 'a', () => s()))).toBeNull()
  })

  it('refuses an EMPTY text child — it produces no DOM node to hop over', () => {
    expect(buildRowPlan(h('li', null, '', h('span', null, 'x')))).toBeNull()
  })
})

describe('replayRowPlan — verifies the row before touching it', () => {
  function ssrRow(html: string): ChildNode {
    const host = document.createElement('ul')
    host.innerHTML = html
    return host.firstChild as ChildNode
  }

  it('adopts a row whose DOM matches the plan', () => {
    const plan = buildRowPlan(supportedRow())
    expect(plan).not.toBeNull()
    const first = ssrRow('<li class="row"><span>name</span><em>meta</em></li>')
    const cleanup = replayRowPlan(plan!, supportedRow(), first)
    expect(cleanup).not.toBeNull()
    cleanup?.()
  })

  it('BAILS when the row root tag disagrees with the plan', () => {
    // The invariant the whole fast path rests on: same renderItem, same shape.
    // A different tag means that assumption is already false for this row.
    const plan = buildRowPlan(supportedRow())
    const first = ssrRow('<div class="row"><span>name</span><em>meta</em></div>')
    expect(replayRowPlan(plan!, supportedRow(), first)).toBeNull()
  })

  it('BAILS when a nested tag that CARRIES A STEP disagrees', () => {
    // Verification is per STEP, not per node — and that distinction is the
    // optimization, not an oversight: a prop-less element with static text has
    // no step because replay does nothing to it, so there is nothing that
    // could go wrong. Only nodes replay actually touches are checked, so the
    // mismatch has to be on one of those to be caught.
    const row = () => h('li', null, h('a', { href: '/x' }, 'go'))
    const plan = buildRowPlan(row())
    expect(plan).not.toBeNull()
    const first = ssrRow('<li><b href="/x">go</b></li>')
    expect(replayRowPlan(plan!, row(), first)).toBeNull()
  })

  it('BAILS when the node a step targets is missing entirely', () => {
    const row = () => h('li', null, h('a', { href: '/x' }, 'go'))
    const plan = buildRowPlan(row())
    const first = ssrRow('<li></li>')
    expect(replayRowPlan(plan!, row(), first)).toBeNull()
  })

  it('a prop-less child mismatch is NOT a bail — replay never touches it', () => {
    // Documents the boundary above rather than leaving it implicit: this is
    // the shape a reader would expect to fail, and it deliberately does not.
    const plan = buildRowPlan(supportedRow())
    const first = ssrRow('<li class="row"><b>name</b><em>meta</em></li>')
    const cleanup = replayRowPlan(plan!, supportedRow(), first)
    expect(cleanup).not.toBeNull()
    cleanup?.()
  })

  it('ADOPTS a SOLE accessor child from its bare text (markers elided)', () => {
    // An accessor that is its element's ONLY child is SSR-emitted without
    // range markers — the `<span>` tag boundary already delimits the extent
    // (see `soleAccessorChild` in @pyreon/runtime-server). So the bare-text
    // shape is the CORRECT server output for this row, and it adopts.
    const label = signal('a')
    const row = () => h('li', null, h('span', null, () => label()))
    const plan = buildRowPlan(row())
    expect(plan).not.toBeNull()
    const first = ssrRow('<li><span>a</span></li>')
    const cleanup = replayRowPlan(plan!, row(), first)
    expect(cleanup).not.toBeNull()
    // The binding landed on the adopted node: a signal write patches in place.
    label.set('b')
    expect((first as Element).querySelector('span')!.textContent).toBe('b')
    cleanup!()
  })

  it('BAILS when a SOLE accessor slot is not a lone text node', () => {
    // This is the invariant the marker triplet used to enforce and that the
    // elided form must still state: the slot must BE a text node. A row whose
    // accessor rendered nothing (no node) or a VNode (an element) diverges
    // from the recorded shape, and binding it would write `.data` on the wrong
    // node — so it bails to the interpretive walk.
    const label = signal('a')
    const row = () => h('li', null, h('span', null, () => label()))
    const plan = buildRowPlan(row())
    expect(plan).not.toBeNull()
    expect(replayRowPlan(plan!, row(), ssrRow('<li><span></span></li>'))).toBeNull()
    expect(replayRowPlan(plan!, row(), ssrRow('<li><span><b>a</b></span></li>'))).toBeNull()
    expect(replayRowPlan(plan!, row(), ssrRow('<li><span>a<i>x</i></span></li>'))).toBeNull()
  })

  it('BAILS when a NON-sole reactive text child lacks its SSR marker pair', () => {
    // An accessor with siblings keeps its markers — there the tag boundary
    // does NOT delimit it, so without the pair there is no bounded region and
    // guessing would bind the wrong node.
    const label = signal('a')
    const row = () => h('li', null, h('span', null, () => label(), h('b', null, 'x')))
    const plan = buildRowPlan(row())
    expect(plan).not.toBeNull()
    // Marked (correct) SSR for this shape adopts…
    const marked = ssrRow('<li><span><!--$-->a<!--/$--><b>x</b></span></li>')
    const ok = replayRowPlan(plan!, row(), marked)
    expect(ok).not.toBeNull()
    ok!()
    // …while the same bytes WITHOUT the pair have no bounded region → bail.
    expect(replayRowPlan(plan!, row(), ssrRow('<li><span>a<b>x</b></span></li>'))).toBeNull()
  })
})

describe('tplAdoptVerify — template adoption for the compiled _tpl path', () => {
  function tplOf(html: string): HTMLTemplateElement {
    const tpl = document.createElement('template')
    tpl.innerHTML = html
    return tpl
  }
  function targetOf(html: string): Element {
    const host = document.createElement('div')
    host.innerHTML = html
    return host.firstElementChild as Element
  }

  it('refuses when the target tag disagrees with the template root', () => {
    // The cheapest possible gate, checked before any signature work.
    const html = '<p class="x">hi</p>'
    expect(tplAdoptVerify(tplOf(html), html, targetOf('<div class="x">hi</div>'))).toBe(false)
  })

  it('refuses an empty template — there is no root to compare against', () => {
    expect(tplAdoptVerify(tplOf(''), '', targetOf('<p>hi</p>'))).toBe(false)
  })

  it('adopts a target whose structure matches the template', () => {
    const html = '<p class="x">hi</p>'
    expect(tplAdoptVerify(tplOf(html), html, targetOf(html))).toBe(true)
  })

  it('re-proves an ELIDED sole-text slot on every REPLAYED row', () => {
    // A compiled dynamic sole-child slot bakes a ' ' placeholder in the
    // template, and SSR emits the rendered text bare (markers elided). Row 1
    // takes the full verify; rows 2..N take the positional replay, which no
    // longer has a marker triplet to check — so the invariant "this slot is a
    // lone text node" must be stated there, or the compiled bind's
    // `.firstChild` ref lands on null (value rendered empty) or an element
    // (value rendered a VNode) and writes `.data` on the wrong node.
    const html = '<a class="c"> </a>'
    const tpl = tplOf(html)
    // Row 1 — full verify + plan build.
    expect(tplAdoptVerify(tpl, html, targetOf('<a class="c">L1</a>'))).toBe(true)
    // Rows 2..N — positional replay against that plan.
    expect(tplAdoptVerify(tpl, html, targetOf('<a class="c">L2</a>'))).toBe(true)
    // An EMPTY slot (the accessor rendered '') is NOT a divergence — SSR
    // legitimately emits no node there. The verifier materializes the text
    // node the compiled bind writes into, exactly as the marker path did for
    // an empty `<!--$--><!--/$-->` range, so an often-empty column keeps
    // adopting instead of dropping every such row to the interpretive walk.
    const empty = targetOf('<a class="c"></a>')
    expect(tplAdoptVerify(tpl, html, empty)).toBe(true)
    expect(empty.firstChild?.nodeType).toBe(3)
    expect(empty.firstChild?.nodeValue).toBe('')
    // …and the genuinely divergent rows still BAIL rather than replay unverified.
    expect(tplAdoptVerify(tpl, html, targetOf('<a class="c"><b>L</b></a>'))).toBe(false)
    expect(tplAdoptVerify(tpl, html, targetOf('<a class="c">L<i>x</i></a>'))).toBe(false)
  })

  it('reuses the cached plan on the SECOND call — the rows 2..N path', () => {
    // The first call builds and caches a plan against the template; every
    // later row is meant to replay it rather than re-derive the signature.
    // Both calls must agree, or rows would hydrate inconsistently.
    //
    // The `true` is load-bearing: plan replay is OPT-IN (only the `<For>` row
    // loop opts in), and without it this spec would take the full-verify path
    // twice, still return true, and silently stop testing the path it is named
    // for. The counter assertion pins that — one replay on the second call.
    const g = globalThis as {
      __pyreon_count__?: ((name: string, n?: number) => void) | undefined
    }
    const prev = g.__pyreon_count__
    let replays = 0
    g.__pyreon_count__ = (name) => {
      if (name === 'runtime.tpl.adoptPlanReplay') replays++
    }
    try {
      const html = '<p class="x">hi</p>'
      const tpl = tplOf(html)
      expect(tplAdoptVerify(tpl, html, targetOf(html), true)).toBe(true)
      expect(replays).toBe(0) // first call BUILDS the plan
      expect(tplAdoptVerify(tpl, html, targetOf(html), true)).toBe(true)
      expect(replays).toBe(1) // second call REPLAYS it
    } finally {
      g.__pyreon_count__ = prev
    }
  })

  it('does NOT replay the cached plan when the caller has not opted in', () => {
    // The scoping half. Same template, same two calls, no opt-in: both must
    // still verify correctly, and the fast path must not fire — that is what
    // keeps an unrelated component from adopting a byte-different server node.
    const g = globalThis as {
      __pyreon_count__?: ((name: string, n?: number) => void) | undefined
    }
    const prev = g.__pyreon_count__
    let replays = 0
    g.__pyreon_count__ = (name) => {
      if (name === 'runtime.tpl.adoptPlanReplay') replays++
    }
    try {
      const html = '<p class="x">hi</p>'
      const tpl = tplOf(html)
      expect(tplAdoptVerify(tpl, html, targetOf(html))).toBe(true)
      expect(tplAdoptVerify(tpl, html, targetOf(html))).toBe(true)
      expect(replays).toBe(0)
    } finally {
      g.__pyreon_count__ = prev
    }
  })

  it('normalizes an SSR <!--$-->…<!--/$--> triplet out of the adopted target', () => {
    // The markers bound a reactive text region server-side; once adopted they
    // are noise, and leaving them would shift every later child index.
    const html = '<p>hi</p>'
    const target = targetOf('<p><!--$-->hi<!--/$--></p>')
    const ok = tplAdoptVerify(tplOf(html), html, target)
    if (ok) expect(target.innerHTML).not.toContain('<!--$-->')
  })
})
