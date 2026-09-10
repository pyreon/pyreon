/**
 * Row-plan replay — the VNODE side of the bail contract.
 *
 * `hydration-plan.test.tsx` covers the grammar `buildRowPlan` accepts and the
 * DOM divergences `replayRowPlan` refuses. This file covers the other half,
 * which is the one that produced a shipped bug: a plan compiled from row 0
 * replayed over N rows where **the rows' VNODES differ**.
 *
 * That asymmetry is the whole point. Per-STEP DOM checks only cover positions
 * the plan touches, and a row that diverges brings its own SSR DOM — so the
 * DOM side agrees with itself while row 0's bindings are applied to a row that
 * needed different ones. The symptoms are silent: a click handler that is
 * present in the markup and dead in the browser, a `ref` that never fires, an
 * extra child that is never hydrated. Nothing throws, and every DOM-side
 * assertion passes.
 *
 * A `renderItem` really does diverge per item — a conditional handler on the
 * active row, an extra badge on one entry, a per-item ref on the row being
 * measured are all ordinary. So the signature (tags, ordered key sequences,
 * child kinds and counts, and the completeness of the walk) is what makes
 * divergence a BAIL to the interpretive walk rather than a wrong page.
 *
 * Every bail below is paired with the row that must still be ADOPTED, because
 * a verifier that refuses everything is indistinguishable from one that works
 * and costs the whole optimization.
 */
import { describe, expect, it, vi } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { buildRowPlan, replayRowPlan } from '../hydration-plan'
import { setupDelegation } from '../delegate'

/**
 * Mount a row into a real delegation root.
 *
 * `onClick` is a DELEGATED event: the binder stores the handler as an
 * `__ev_click` expando and ONE listener on the mount container walks
 * `e.target` upward to invoke it. A row appended to a bare `document.body`
 * with no delegation root therefore has a handler that is bound and can
 * never fire — which would make the "the handler fires" control pass for the
 * wrong reason, or fail for one.
 */
function delegatedHost(html: string): { host: HTMLElement; first: ChildNode } {
  const host = document.createElement('ul')
  host.innerHTML = html
  document.body.appendChild(host)
  setupDelegation(host)
  return { host, first: host.firstChild as ChildNode }
}

/** Parse SSR markup and hand back the row's root node. */
function ssrRow(html: string): ChildNode {
  const host = document.createElement('ul')
  host.innerHTML = html
  return host.firstChild as ChildNode
}

/**
 * Replay `row` against `html` using a plan built from `planRow`.
 * Returns the cleanup, or null when the row bailed.
 */
function replay(
  planRow: ReturnType<typeof h>,
  row: ReturnType<typeof h>,
  html: string,
): (() => void) | null {
  const plan = buildRowPlan(planRow)
  expect(plan, 'the fixture must produce a plan at all').not.toBeNull()
  return replayRowPlan(plan!, row, ssrRow(html))
}

describe('a row whose PROP KEYS diverge from row 0 bails', () => {
  const base = () => h('li', { class: 'row' }, h('button', { onClick: () => {} }, 'go'))
  const BASE_HTML = '<li class="row"><button>go</button></li>'

  it('adopts a row with the same key sequence', () => {
    // The control. Every bail below is only meaningful against a replay that
    // succeeds for the matching shape — and this one binds a real handler,
    // which the next spec is about losing.
    const clicks: number[] = []
    const row = h('li', { class: 'row' }, h('button', { onClick: () => clicks.push(1) }, 'go'))
    const cleanup = replay(base(), row, BASE_HTML)
    expect(cleanup).not.toBeNull()
    cleanup?.()
  })

  it('BAILS on an EXTRA key — the conditional handler shape', () => {
    // `renderItem` puts `onClick` only on the active row, or adds
    // `aria-current` to one of them. Row 0 has no such key, so its op list
    // does not carry it, and replaying that list over this row leaves the
    // handler unbound — present in the markup, dead in the browser.
    const row = h(
      'li',
      { class: 'row' },
      h('button', { onClick: () => {}, 'aria-pressed': 'true' }, 'go'),
    )
    expect(replay(base(), row, BASE_HTML)).toBeNull()
  })

  it('BAILS on a MISSING key', () => {
    // The mirror: row 0 had the handler and this row does not. Replaying row
    // 0's op list would read `undefined` for it, which the event binder is
    // free to interpret differently from "never had one".
    const row = h('li', { class: 'row' }, h('button', null, 'go'))
    expect(replay(base(), row, BASE_HTML)).toBeNull()
  })

  it('BAILS on the same keys in a DIFFERENT ORDER', () => {
    // Conservative on purpose. The ops are recorded and replayed positionally,
    // and two rows built by the same code path have the same insertion order —
    // so a different order means a different code path built this row, which
    // is exactly the assumption the fast path rests on being false.
    const planRow = h('li', null, h('a', { href: '/x', title: 't' }, 'go'))
    const row = h('li', null, h('a', { title: 't', href: '/x' }, 'go'))
    expect(replay(planRow, row, '<li><a href="/x" title="t">go</a></li>')).toBeNull()
  })

  it('BAILS on a key divergence on the ROOT, not just a child', () => {
    const row = h('li', { class: 'row', id: 'r1' }, h('button', { onClick: () => {} }, 'go'))
    expect(replay(base(), row, BASE_HTML)).toBeNull()
  })

  it('BAILS when the root TAG diverges even though the DOM agrees with it', () => {
    // The DOM here is a `<div>` and so is the row, so every DOM-side check
    // passes — only the signature notices that row 0 was an `<li>`.
    const row = h('div', { class: 'row' }, h('button', { onClick: () => {} }, 'go'))
    expect(replay(base(), row, '<div class="row"><button>go</button></div>')).toBeNull()
  })
})

describe('a row whose CHILD SHAPE diverges bails', () => {
  const base = () => h('li', null, h('span', { id: 'a' }, 'one'), h('span', { id: 'b' }, 'two'))
  const BASE_HTML = '<li><span id="a">one</span><span id="b">two</span></li>'

  it('adopts the matching child shape', () => {
    expect(replay(base(), base(), BASE_HTML)).not.toBeNull()
  })

  it('BAILS on an EXTRA child — the per-item badge', () => {
    // One row carries a badge the others do not. The plan's DOM paths are
    // child INDICES, so an extra child shifts every sibling after it and the
    // steps land on the wrong nodes.
    const row = h(
      'li',
      null,
      h('span', { id: 'a' }, 'one'),
      h('b', null, 'new'),
      h('span', { id: 'b' }, 'two'),
    )
    expect(
      replay(base(), row, '<li><span id="a">one</span><b>new</b><span id="b">two</span></li>'),
    ).toBeNull()
  })

  it('BAILS on a MISSING child — the truncated row', () => {
    // The completeness check. Per-node compares all pass for the children that
    // ARE there; without the whole-signature check the walk simply stops early
    // and leaves the later steps' targets unfilled, which binds `undefined`.
    const row = h('li', null, h('span', { id: 'a' }, 'one'))
    expect(replay(base(), row, '<li><span id="a">one</span></li>')).toBeNull()
  })

  it('BAILS when an element child becomes a TEXT child', () => {
    // Same count, different kind. An element occupies one node and so does a
    // text node, so the indices still line up — the kind is the only signal.
    const row = h('li', null, h('span', { id: 'a' }, 'one'), 'two')
    expect(replay(base(), row, '<li><span id="a">one</span>two</li>')).toBeNull()
  })

  it('BAILS when a text child becomes an ACCESSOR child', () => {
    // A static label on most rows and a live one on the row being edited.
    // Statically both are "one node here"; only the kind distinguishes them,
    // and binding the wrong one either freezes the text or throws.
    const planRow = h('li', null, h('span', null, 'label'))
    const row = h('li', null, h('span', null, () => 'label'))
    expect(replay(planRow, row, '<li><span>label</span></li>')).toBeNull()
  })

  it('BAILS when an accessor child becomes a STATIC text child', () => {
    const label = signal('x')
    const planRow = h('li', null, h('span', null, () => label()))
    const row = h('li', null, h('span', null, 'x'))
    expect(replay(planRow, row, '<li><span>x</span></li>')).toBeNull()
  })

  it('BAILS when a row renders an EMPTY string where row 0 had text', () => {
    // An empty string emits NO DOM node, so this row's real SSR markup is one
    // node short of what the plan's indices assume — every later step is off
    // by one. `buildRowPlan` refuses to PLAN this shape; the row-side check is
    // what catches it arriving later.
    const planRow = h('li', null, h('span', null, 'a'), h('em', { id: 'm' }, 'b'))
    const row = h('li', null, h('span', null, ''), h('em', { id: 'm' }, 'b'))
    expect(replay(planRow, row, '<li><span></span><em id="m">b</em></li>')).toBeNull()
  })

  it('BAILS when a child becomes something outside the grammar entirely', () => {
    // A component, a fragment, an array — the plan cannot know their node
    // count, which is why `buildRowPlan` refuses them up front.
    const Comp = () => h('span', null, 'x')
    const row = h('li', null, h('span', { id: 'a' }, 'one'), h(Comp, null))
    expect(replay(base(), row, BASE_HTML)).toBeNull()
  })

  it('BAILS when the divergence is DEEP rather than at the top level', () => {
    // Verification recurses; a shape check that only looked at the root would
    // pass this and bind the nested step against the wrong node.
    const planRow = h('li', null, h('div', null, h('a', { href: '/x' }, 'go')))
    const row = h('li', null, h('div', null, h('a', { href: '/x', rel: 'nofollow' }, 'go')))
    expect(replay(planRow, row, '<li><div><a href="/x">go</a></div></li>')).toBeNull()
  })
})

describe('what replay does once a row verifies', () => {
  it('binds an event handler that actually fires', () => {
    // The control for the whole file: without this, "bails on divergence" is
    // satisfied by a replay that binds nothing for anyone.
    const clicks: string[] = []
    const planRow = h('li', null, h('button', { onClick: () => {} }, 'go'))
    const row = h('li', null, h('button', { onClick: () => clicks.push('hit') }, 'go'))
    const { host, first } = delegatedHost('<li><button>go</button></li>')
    const plan = buildRowPlan(planRow)
    const cleanup = replayRowPlan(plan!, row, first)
    expect(cleanup).not.toBeNull()
    ;(first.firstChild as HTMLElement).click()
    expect(clicks, 'the handler must reach the real element').toEqual(['hit'])
    cleanup?.()
    host.remove()
  })

  it('applies class and style through their specialized ops', () => {
    const planRow = h('li', { class: 'a', style: { color: 'red' } }, 'x')
    const row = h('li', { class: 'b', style: { color: 'blue' } }, 'x')
    const first = ssrRow('<li class="a" style="color: red">x</li>') as HTMLElement
    const cleanup = replayRowPlan(buildRowPlan(planRow)!, row, first)
    expect(cleanup).not.toBeNull()
    expect(first.getAttribute('class'), 'the ROW\'s value, not the plan\'s').toBe('b')
    expect(first.style.color).toBe('blue')
    cleanup?.()
  })

  it('resolves a class ACCESSOR reactively, and stops on cleanup', () => {
    // A per-row reactive class is the shape a selection highlight takes. The
    // op has to wrap it in an effect, not read it once — and the effect has to
    // die with the row, or a removed row keeps re-styling a detached node.
    const active = signal(false)
    const planRow = h('li', { class: () => 'x' }, 'x')
    const row = h('li', { class: () => (active() ? 'on' : 'off') }, 'x')
    const first = ssrRow('<li class="off">x</li>') as HTMLElement
    const cleanup = replayRowPlan(buildRowPlan(planRow)!, row, first)
    expect(cleanup).not.toBeNull()
    expect(first.getAttribute('class')).toBe('off')
    active.set(true)
    expect(first.getAttribute('class'), 'the binding must be live').toBe('on')
    cleanup?.()
    active.set(false)
    expect(first.getAttribute('class'), 'and dead after cleanup').toBe('on')
  })

  it('resolves a style ACCESSOR reactively', () => {
    const w = signal('10px')
    const planRow = h('li', { style: () => ({ width: '0px' }) }, 'x')
    const row = h('li', { style: () => ({ width: w() }) }, 'x')
    const first = ssrRow('<li style="width: 0px">x</li>') as HTMLElement
    const cleanup = replayRowPlan(buildRowPlan(planRow)!, row, first)
    expect(first.style.width).toBe('10px')
    w.set('20px')
    expect(first.style.width).toBe('20px')
    cleanup?.()
  })

  it('wires a ROOT ref and NULLS it on cleanup', () => {
    // A per-row ref is how a virtualizer measures rows. A ref that fires and
    // never releases pins the detached row and its whole subtree — and one
    // that never fires leaves the measurement at zero, silently.
    const seen: Array<Element | null> = []
    const planRow = h('li', { ref: () => {} }, 'x')
    const row = h('li', { ref: (el: Element | null) => seen.push(el) }, 'x')
    const first = ssrRow('<li>x</li>')
    const cleanup = replayRowPlan(buildRowPlan(planRow)!, row, first)
    expect(cleanup).not.toBeNull()
    expect(seen[0], 'the ref must receive the adopted node itself').toBe(first)
    cleanup?.()
    expect(seen[1], 'and be released, not left pinning it').toBeNull()
  })

  it('wires a ref OBJECT as well as a callback', () => {
    const ref: { current: Element | null } = { current: null }
    const planRow = h('li', null, h('span', { ref: { current: null }, id: 'a' }, 'x'))
    const row = h('li', null, h('span', { ref, id: 'a' }, 'x'))
    const first = ssrRow('<li><span id="a">x</span></li>')
    const cleanup = replayRowPlan(buildRowPlan(planRow)!, row, first)
    expect(cleanup).not.toBeNull()
    expect(ref.current).toBe(first.firstChild)
    cleanup?.()
    expect(ref.current, 'released on cleanup').toBeNull()
  })

  it('falls back to applyProps for a GETTER-shaped prop, and stays reactive', () => {
    // A compiler-emitted reactive prop arrives as a property GETTER. Recording
    // an op list would read it once at plan time and freeze it, so the plan
    // records nothing and hands the whole object to the getter-aware
    // `applyProps` — the row is still hydrated, just not specialized.
    const title = signal('one')
    const mkProps = () => {
      const p: Record<string, unknown> = {}
      Object.defineProperty(p, 'title', { get: () => title(), enumerable: true, configurable: true })
      return p
    }
    const planRow = h('li', mkProps(), 'x')
    const row = h('li', mkProps(), 'x')
    const first = ssrRow('<li title="one">x</li>') as HTMLElement
    const cleanup = replayRowPlan(buildRowPlan(planRow)!, row, first)
    expect(cleanup).not.toBeNull()
    title.set('two')
    expect(first.getAttribute('title'), 'a getter prop must stay live').toBe('two')
    cleanup?.()
  })

  it('binds a sole accessor child and keeps it live', () => {
    const label = signal('a')
    const planRow = h('li', null, h('span', null, () => 'seed'))
    const row = h('li', null, h('span', null, () => label()))
    const first = ssrRow('<li><span>a</span></li>')
    const cleanup = replayRowPlan(buildRowPlan(planRow)!, row, first)
    expect(cleanup).not.toBeNull()
    label.set('b')
    expect((first.firstChild as HTMLElement).textContent).toBe('b')
    cleanup?.()
  })

  it('composes EVERY binding into one cleanup', () => {
    // Several steps, several disposers. Returning only the first would leak
    // the rest for the life of the page.
    const a = signal('1')
    const b = signal('2')
    const refs: Array<Element | null> = []
    const mk = () =>
      h(
        'li',
        { ref: (el: Element | null) => refs.push(el), class: () => `r${a()}` },
        h('span', { id: 'x', title: () => b() }, 'one'),
        h('em', null, () => a()),
      )
    const first = ssrRow('<li class="r1"><span id="x" title="2">one</span><em>1</em></li>')
    const cleanup = replayRowPlan(buildRowPlan(mk())!, mk(), first)
    expect(cleanup).not.toBeNull()
    cleanup?.()
    a.set('9')
    b.set('9')
    expect((first as HTMLElement).getAttribute('class'), 'root class frozen').toBe('r1')
    expect((first.firstChild as HTMLElement).getAttribute('title'), 'step prop frozen').toBe('2')
    expect(refs[refs.length - 1], 'ref released').toBeNull()
  })
})

describe('the row still has to match its DOM', () => {
  const base = () => h('li', null, h('a', { href: '/x' }, 'go'))

  it('BAILS when the first node is not an element at all', () => {
    // A text node where the row root should be — the caller's cursor is off,
    // and binding into it would write props onto the wrong thing.
    const host = document.createElement('ul')
    host.append(document.createTextNode('stray'))
    expect(replayRowPlan(buildRowPlan(base())!, base(), host.firstChild as ChildNode)).toBeNull()
  })

  it('BAILS when a step resolves to a TEXT node instead of an element', () => {
    const first = ssrRow('<li>go</li>')
    expect(replayRowPlan(buildRowPlan(base())!, base(), first)).toBeNull()
  })

  it('BAILS when a NON-sole accessor slot is missing its close marker', () => {
    // Two children, so SSR emits the `<!--$-->…<!--/$-->` triplet. Without the
    // close, the extent is unknowable and the next sibling's index is wrong.
    const label = signal('a')
    const row = () => h('li', null, h('span', null, () => label(), 'tail'))
    const first = ssrRow('<li><span><!--$-->a tail</span></li>')
    expect(replayRowPlan(buildRowPlan(row())!, row(), first)).toBeNull()
  })

  it('BAILS when a sole accessor slot holds an ELEMENT rather than text', () => {
    // The markers are elided for a sole child, so the invariant has to be
    // stated directly: this position must be a lone text node. A row whose
    // accessor rendered a VNode diverges, and `.data` on an element is not a
    // binding, it is a silent no-op.
    const label = signal<string>('a')
    const row = () => h('li', null, h('span', null, () => label()))
    const first = ssrRow('<li><span><b>a</b></span></li>')
    expect(replayRowPlan(buildRowPlan(row())!, row(), first)).toBeNull()
  })

  it('BAILS when a sole accessor slot has a TRAILING sibling', () => {
    // "Sole" is the premise the elision rests on. Anything after the text
    // means the server emitted a shape the plan did not describe.
    const label = signal('a')
    const row = () => h('li', null, h('span', null, () => label()))
    const first = ssrRow('<li><span>a<b>extra</b></span></li>')
    expect(replayRowPlan(buildRowPlan(row())!, row(), first)).toBeNull()
  })

  it('binds NOTHING when it bails — the row is untouched for the walk', () => {
    // The contract the caller depends on: a null return means the
    // interpretive walk starts from a clean row. Half-applied props would be
    // applied twice.
    const clicks: number[] = []
    const planRow = h('li', { id: 'r' }, h('button', { onClick: () => {} }, 'go'))
    // Diverges only at the LAST step, so an unverified replay would already
    // have applied the root's props by the time it noticed.
    const row = h('li', { id: 'r' }, h('button', { onClick: () => clicks.push(1), tab: '1' }, 'go'))
    const { host, first } = delegatedHost('<li><button>go</button></li>')
    expect(replayRowPlan(buildRowPlan(planRow)!, row, first)).toBeNull()
    expect((first as HTMLElement).getAttribute('id'), 'no prop was applied').toBeNull()
    ;(first.firstChild as HTMLElement).click()
    expect(clicks, 'and no handler was bound').toEqual([])
    host.remove()
  })
})

describe('plan reuse across many rows', () => {
  it('adopts every row of a uniform list from ONE plan', () => {
    // The case the fast path exists for.
    const mk = (n: number) => h('li', { class: 'row' }, h('span', { title: `t${n}` }, `r${n}`))
    const plan = buildRowPlan(mk(0))
    expect(plan).not.toBeNull()
    const cleanups: Array<() => void> = []
    for (let i = 0; i < 5; i++) {
      const first = ssrRow(`<li class="row"><span title="t${i}">r${i}</span></li>`)
      const c = replayRowPlan(plan!, mk(i), first)
      expect(c, `row ${i}`).not.toBeNull()
      expect((first.firstChild as HTMLElement).getAttribute('title')).toBe(`t${i}`)
      cleanups.push(c!)
    }
    for (const c of cleanups) c()
  })

  it('bails ONLY the divergent row, leaving the rest adopted', () => {
    // The failure mode is per-row, not per-list: one odd item must not cost
    // the optimization for the other nine, and must not be silently bound
    // with the majority's shape either.
    const uniform = (n: number) => h('li', null, h('span', { title: `t${n}` }, `r${n}`))
    const odd = h('li', null, h('span', { title: 'x', 'data-odd': '1' }, 'r2'))
    const plan = buildRowPlan(uniform(0))!
    const results = [0, 1, 2, 3].map((i) => {
      const html =
        i === 2
          ? '<li><span title="x" data-odd="1">r2</span></li>'
          : `<li><span title="t${i}">r${i}</span></li>`
      const c = replayRowPlan(plan, i === 2 ? odd : uniform(i), ssrRow(html))
      c?.()
      return c !== null
    })
    expect(results).toEqual([true, true, false, true])
  })

  it('does not mutate the plan while verifying a row', () => {
    // The verify state is per-call. A cursor kept on the plan would make row 2
    // read row 1's leftovers — and the first row would still pass, so the bug
    // would look like "works for one row".
    const mk = () => h('li', null, h('span', { id: 'a' }, 'x'), h('em', { id: 'b' }, 'y'))
    const plan = buildRowPlan(mk())!
    const snapshot = JSON.stringify({
      tags: plan.sigTags,
      counts: plan.sigChildCounts,
      keys: plan.sigKeys,
      kinds: plan.sigKinds,
    })
    for (let i = 0; i < 3; i++) {
      replayRowPlan(plan, mk(), ssrRow('<li><span id="a">x</span><em id="b">y</em></li>'))?.()
    }
    expect(
      JSON.stringify({
        tags: plan.sigTags,
        counts: plan.sigChildCounts,
        keys: plan.sigKeys,
        kinds: plan.sigKinds,
      }),
    ).toBe(snapshot)
  })

  it('a bailed row does not poison the NEXT row', () => {
    const uniform = () => h('li', null, h('span', { id: 'a' }, 'x'))
    const plan = buildRowPlan(uniform())!
    expect(replayRowPlan(plan, h('li', null, 'text'), ssrRow('<li>text</li>'))).toBeNull()
    const c = replayRowPlan(plan, uniform(), ssrRow('<li><span id="a">x</span></li>'))
    expect(c, 'the plan is still usable').not.toBeNull()
    c?.()
  })
})

describe('shapes buildRowPlan refuses to plan at all', () => {
  it('refuses a nullish or boolean child', () => {
    // `{cond && <b/>}` renders nothing when false, and the plan cannot tell a
    // statically-absent node from a slot it should hop over.
    expect(buildRowPlan(h('li', null, h('span', null, 'a'), null))).toBeNull()
    expect(buildRowPlan(h('li', null, false, h('span', null, 'a')))).toBeNull()
    expect(buildRowPlan(h('li', null, true))).toBeNull()
  })

  it('refuses an accessor that follows a text child', () => {
    // The parser merges the static text with the accessor's leading text into
    // ONE node, so the accessor's marker index is wrong before it is used.
    expect(buildRowPlan(h('li', null, 'label: ', () => 'v'))).toBeNull()
  })

  it('refuses dangerouslySetInnerHTML as well as innerHTML', () => {
    // Both make the subtree opaque: the plan's child indices describe nodes
    // the server generated from a string it cannot see.
    expect(buildRowPlan(h('li', { dangerouslySetInnerHTML: { __html: '<b>x</b>' } }))).toBeNull()
    expect(buildRowPlan(h('li', null, h('span', { innerHTML: '<b>x</b>' })))).toBeNull()
  })

  it('refuses a NESTED select, not just a select root', () => {
    // `<select value>` must be applied AFTER its options exist; a plan that
    // applies props in DOM order would set it against an empty list, which
    // silently selects the first option.
    expect(buildRowPlan(h('li', null, h('select', { value: 'b' })))).toBeNull()
  })

  it('plans a row whose only prop is `key` as having no work', () => {
    // `key` and `children` are never DOM props, so a row carrying only those
    // needs no root binding — and recording one would apply `key` as an
    // attribute.
    const plan = buildRowPlan(h('li', { key: 'k' }, h('span', null, 'x')))
    expect(plan).not.toBeNull()
    expect(plan!.rootHasWork, 'key alone is not work').toBe(false)
  })
})

describe('the plan carries no DOM references between rows', () => {
  it('holds nothing that could pin a row after it is removed', () => {
    // The plan is built once and lives as long as the list. Anything DOM-shaped
    // on it would retain row 0's subtree for the life of the page — leak class
    // H, in the object explicitly designed to be shared across every row.
    const plan = buildRowPlan(h('li', { class: 'r' }, h('a', { href: '/x' }, 'go')))!
    const seen = new Set<unknown>()
    const walk = (v: unknown, depth: number): void => {
      if (depth > 6 || v === null || typeof v !== 'object') return
      if (seen.has(v)) return
      seen.add(v)
      expect(v instanceof Node, 'a DOM node reached from the plan').toBe(false)
      for (const x of Object.values(v)) walk(x, depth + 1)
    }
    walk(plan, 0)
  })

  it('is JSON-describable — no closures over row 0 beyond the op binders', () => {
    // Documents what the plan IS: tags, indices and key names. The only
    // functions on it are the event-binder factories, which are per-KEY and
    // carry no row state.
    const plan = buildRowPlan(h('li', { class: 'r' }, h('span', { id: 'a' }, 'x')))!
    expect(plan.sigTags).toEqual(['li', 'span'])
    expect(plan.sigKinds.length).toBe(2)
    expect(plan.rootTag).toBe('li')
  })
})

describe('an event op composes its own release', () => {
  it('removes the handler when the row is cleaned up', () => {
    // A row removed from a virtualized list must stop receiving events; a
    // handler left bound keeps the row's closure — and its data — alive.
    const clicks: number[] = []
    const planRow = h('li', null, h('button', { onClick: () => {} }, 'go'))
    const row = h('li', null, h('button', { onClick: () => clicks.push(1) }, 'go'))
    const { host, first } = delegatedHost('<li><button>go</button></li>')
    const cleanup = replayRowPlan(buildRowPlan(planRow)!, row, first)
    ;(first.firstChild as HTMLElement).click()
    expect(clicks).toEqual([1])
    cleanup?.()
    ;(first.firstChild as HTMLElement).click()
    expect(clicks, 'no further deliveries after cleanup').toEqual([1])
    host.remove()
  })

  it('leaves no console noise on the adopted path', () => {
    // A fast path that works but warns on every row is a fast path people
    // switch off.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mk = () => h('li', { class: 'r' }, h('span', { id: 'a' }, 'x'))
    replayRowPlan(buildRowPlan(mk())!, mk(), ssrRow('<li class="r"><span id="a">x</span></li>'))?.()
    expect(warn).not.toHaveBeenCalled()
    expect(err).not.toHaveBeenCalled()
    warn.mockRestore()
    err.mockRestore()
  })
})
