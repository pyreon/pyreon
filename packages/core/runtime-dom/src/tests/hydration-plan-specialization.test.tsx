/**
 * Regression lock — prop-level plan specialization + the row-shape signature.
 *
 * Two halves, both bisect-verified:
 *
 *  1. SPECIALIZATION — `replayRowPlan` applies props through per-key ops
 *     compiled once at plan build (event binder / class / style / generic)
 *     instead of per-row `applyProp` dispatch. The behavior specs here (real
 *     delegated click, reactive class/style/attr flips over REPLAY-bound
 *     rows) prove the ops are equivalent to the interpretive walk's
 *     primitives.
 *
 *  2. SHAPE SIGNATURE — the plan is recorded from row 0, and pre-fix a row
 *     whose VNODE diverged from row 0 was silently adopted with the plan's
 *     bindings only: an onClick present on row 5 but not row 0 was DROPPED
 *     (dead click, zero warnings — every DOM-side check passes because the
 *     SSR DOM came from row 5's own vnode), an extra child's handler was
 *     dropped, and a row-root `ref` NEVER fired (refs were wired for step
 *     elements only). Now every row's vnode is verified against a shape
 *     signature (tags, ordered key sequences, child kinds/counts) BEFORE any
 *     binding; divergence bails that row to the interpretive walk, which
 *     binds it correctly.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hydrateRoot } from '../index'
import { buildRowPlan, replayRowPlan } from '../hydration-plan'
import { makeEventBinder } from '../props'

// ─── Local counter sink ──────────────────────────────────────────────────────
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
const replayed = () => counts['runtime.hydrate.rowReplay'] ?? 0

async function ssrInto(vnode: unknown): Promise<HTMLElement> {
  const html = await renderToString(vnode as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

function ssrRow(html: string): ChildNode {
  const host = document.createElement('ul')
  host.innerHTML = html
  return host.firstChild as ChildNode
}

// ─── 1. Specialized ops behave like the interpretive primitives ──────────────

describe('replayRowPlan — specialized ops (equivalence with the interpretive walk)', () => {
  it('binds a DELEGATED handler + reactive class + reactive generic attr over replayed rows', async () => {
    interface Row {
      id: number
      label: ReturnType<typeof signal<string>>
    }
    const rows: Row[] = [1, 2, 3].map((id) => ({ id, label: signal(`L${id}`) }))
    const selected = signal<number | null>(null)
    const app = () =>
      h(
        'div',
        null,
        h(For, {
          each: () => rows,
          by: (r: Row) => r.id,
          children: (r: Row) =>
            h(
              'b',
              {
                class: () => (selected() === r.id ? 'sel' : ''),
                title: () => `t-${r.label()}`,
                style: { fontWeight: 'bold' },
                onClick: () => selected.set(r.id),
              },
              () => r.label(),
            ),
        }),
      )
    const host = await ssrInto(app())
    const preNode = host.querySelectorAll('b')[1]!
    const dispose = hydrateRoot(host, app())
    // All three rows replayed through the plan (identical shapes).
    expect(replayed()).toBe(3)
    // Adoption, not swap: the pre-hydration node is still the live one.
    expect(host.querySelectorAll('b')[1]).toBe(preNode)
    // Event op: a REAL click through the delegation root selects the row…
    preNode.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(selected()).toBe(2)
    // …and the class op's renderEffect re-ran from the signal write.
    expect(preNode.className).toBe('sel')
    expect(host.querySelectorAll('b')[0]!.className).toBe('')
    // Generic op (function value → renderEffect via applyProp): tracks the label.
    expect(preNode.getAttribute('title')).toBe('t-L2')
    rows[1]!.label.set('X')
    expect(preNode.getAttribute('title')).toBe('t-X')
    expect(preNode.textContent).toBe('X')
    // Style op applied the object form.
    expect((preNode as unknown as HTMLElement).style.fontWeight).toBe('bold')
    dispose()
  })

  it('cleanup over replay-bound rows detaches the delegated handler expando', () => {
    let clicks = 0
    const row = () => h('li', null, h('a', { onClick: () => clicks++ }, 'go'))
    const plan = buildRowPlan(row())
    expect(plan).not.toBeNull()
    const first = ssrRow('<li><a>go</a></li>')
    const cleanup = replayRowPlan(plan!, row(), first)
    expect(cleanup).not.toBeNull()
    const a = (first as Element).querySelector('a') as unknown as Element & Record<string, unknown>
    expect(typeof a['__ev_click']).toBe('function')
    cleanup!()
    expect(a['__ev_click']).toBeUndefined()
    void clicks
  })
})

// ─── 2. Shape-signature bails (the silent-drop class, all bisect-load-bearing) ─

describe('replayRowPlan — row-shape divergence BAILS instead of silently dropping bindings', () => {
  it('BAILS a row with an EXTRA onClick absent in row 0 (pre-fix: dead click)', () => {
    const row0 = () => h('li', null, h('a', { href: '/x' }, 'go'))
    const rowK = () => h('li', null, h('a', { href: '/x', onClick: () => {} }, 'go'))
    const plan = buildRowPlan(row0())
    expect(plan).not.toBeNull()
    // SSR DOM for rowK came from rowK's own vnode — every DOM check passes,
    // which is exactly why the vnode-side signature is load-bearing.
    expect(replayRowPlan(plan!, rowK(), ssrRow('<li><a href="/x">go</a></li>'))).toBeNull()
  })

  it('BAILS a row with an extra CHILD under a workless parent (pre-fix: unhydrated subtree)', () => {
    const row0 = () => h('li', null, h('span', null, 'x'))
    const rowK = () =>
      h('li', null, h('span', null, 'x'), h('a', { onClick: () => {} }, 'go'))
    const plan = buildRowPlan(row0())
    expect(plan).not.toBeNull()
    expect(
      replayRowPlan(plan!, rowK(), ssrRow('<li><span>x</span><a>go</a></li>')),
    ).toBeNull()
  })

  it('BAILS a row whose ROOT gained a prop key', () => {
    const row0 = () => h('li', { class: 'r' }, 'x')
    const rowK = () => h('li', { class: 'r', 'data-x': '1' }, 'x')
    const plan = buildRowPlan(row0())
    expect(plan).not.toBeNull()
    expect(replayRowPlan(plan!, rowK(), ssrRow('<li class="r" data-x="1">x</li>'))).toBeNull()
  })

  it('BAILS a row with FEWER children than row 0 (truncated shape)', () => {
    const row0 = () =>
      h('li', null, h('span', null, 'x'), h('a', { onClick: () => {} }, 'go'))
    const rowK = () => h('li', null, h('span', null, 'x'))
    const plan = buildRowPlan(row0())
    expect(plan).not.toBeNull()
    expect(replayRowPlan(plan!, rowK(), ssrRow('<li><span>x</span></li>'))).toBeNull()
  })

  it('BAILS a nesting rebalance (same tags, different structure)', () => {
    // Same element tags in the same DFS order, but nested differently — only
    // the per-element childCount comparison distinguishes them.
    const row0 = () => h('li', null, h('span', null), h('b', null))
    const rowK = () => h('li', null, h('span', null, h('b', null)))
    const plan = buildRowPlan(row0())
    expect(plan).not.toBeNull()
    expect(replayRowPlan(plan!, rowK(), ssrRow('<li><span><b></b></span></li>'))).toBeNull()
  })

  it('BAILS a row whose static text became EMPTY (its SSR shape has no text node)', () => {
    const row0 = () => h('li', null, 'x', h('em', null, 'm'))
    const rowK = () => h('li', null, '', h('em', null, 'm'))
    const plan = buildRowPlan(row0())
    expect(plan).not.toBeNull()
    expect(replayRowPlan(plan!, rowK(), ssrRow('<li><em>m</em></li>'))).toBeNull()
  })

  it('end-to-end: a For with per-row conditional handlers — divergent rows fall back to the interpretive walk and their clicks WORK', async () => {
    interface Row {
      id: number
      label: ReturnType<typeof signal<string>>
    }
    const rows: Row[] = [1, 2, 3].map((id) => ({ id, label: signal(`L${id}`) }))
    let lastClicked = 0
    const app = () =>
      h(
        'div',
        null,
        h(For, {
          each: () => rows,
          by: (r: Row) => r.id,
          children: (r: Row) =>
            h(
              'b',
              // Row 1 (the plan source) has NO handler; rows 2-3 do — the
              // exact shape that silently shipped dead clicks pre-fix.
              r.id === 1 ? { class: 'plain' } : { class: 'hot', onClick: () => (lastClicked = r.id) },
              () => r.label(),
            ),
        }),
      )
    const host = await ssrInto(app())
    const dispose = hydrateRoot(host, app())
    // Only the row-0-shaped row replays; the divergent rows bailed.
    expect(replayed()).toBe(1)
    const bs = host.querySelectorAll('b')
    bs[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(lastClicked).toBe(3)
    dispose()
  })
})

// ─── 3. Row-root ref (pre-fix: never wired on the replay path) ───────────────

describe('replayRowPlan — root ref', () => {
  it('fires the row-root ref on adopt and nulls it on cleanup', () => {
    let refEl: Element | null = null
    const row = () =>
      h('li', { class: 'r', ref: (el: Element | null) => (refEl = el) }, 'x')
    const plan = buildRowPlan(row())
    expect(plan).not.toBeNull()
    const first = ssrRow('<li class="r">x</li>')
    const cleanup = replayRowPlan(plan!, row(), first)
    expect(cleanup).not.toBeNull()
    expect(refEl).toBe(first)
    cleanup!()
    expect(refEl).toBeNull()
  })

  it('end-to-end: every replayed row wires its root ref', async () => {
    interface Row {
      id: number
      label: ReturnType<typeof signal<string>>
    }
    const rows: Row[] = [1, 2, 3].map((id) => ({ id, label: signal(`L${id}`) }))
    const seen: Element[] = []
    const app = () =>
      h(
        'div',
        null,
        h(For, {
          each: () => rows,
          by: (r: Row) => r.id,
          children: (r: Row) =>
            h('b', { ref: (el: Element | null) => el && seen.push(el) }, () => r.label()),
        }),
      )
    const host = await ssrInto(app())
    const dispose = hydrateRoot(host, app())
    expect(replayed()).toBe(3)
    // Refs point at the ADOPTED (pre-existing) SSR elements.
    const live: Element[] = [...host.querySelectorAll('b')]
    expect(seen.filter((el) => live.includes(el)).length).toBe(3)
    dispose()
  })
})

// ─── 4. makeEventBinder ≡ applyEventProp ─────────────────────────────────────

describe('makeEventBinder — equivalence with the canonical event path', () => {
  it('returns null for a non-event key', () => {
    expect(makeEventBinder('class')).toBeNull()
    expect(makeEventBinder('title')).toBeNull()
    expect(makeEventBinder('online')).toBeNull() // no on[A-Z] — not an event prop
  })

  it('DELEGATED event: same expando slot, cleared by cleanup', () => {
    const bind = makeEventBinder('onClick')!
    const el = document.createElement('button') as unknown as Element & Record<string, unknown>
    const c = bind(el, () => {})
    expect(typeof el['__ev_click']).toBe('function')
    c!()
    expect(el['__ev_click']).toBeUndefined()
  })

  it('NON-delegated event: real listener attached, fires, detached by cleanup', () => {
    // 'myevent' is not in DELEGATED_EVENTS → addEventListener path.
    const bind = makeEventBinder('onMyevent')!
    const el = document.createElement('div')
    let fired = 0
    const c = bind(el, () => fired++)
    el.dispatchEvent(new Event('myevent'))
    expect(fired).toBe(1)
    c!()
    el.dispatchEvent(new Event('myevent'))
    expect(fired).toBe(1)
  })

  it('multi-word name normalizes all-lowercase (the pointerdown class)', () => {
    const bind = makeEventBinder('onPointerDown')!
    const el = document.createElement('div') as unknown as Element & Record<string, unknown>
    const c = bind(el, () => {})
    // pointerdown IS delegated — the expando must use the all-lowercase name.
    expect(typeof el['__ev_pointerdown']).toBe('function')
    c!()
  })

  it('nullish / non-function values are a silent no-op (conditional-handler pattern)', () => {
    const bind = makeEventBinder('onClick')!
    const el = document.createElement('button') as unknown as Element & Record<string, unknown>
    expect(bind(el, undefined)).toBeNull()
    expect(bind(el, null)).toBeNull()
    expect(el['__ev_click']).toBeUndefined()
  })
})
