/**
 * A prop-derived `const` whose initializer is a HOOK / FACTORY call must be
 * REFERENCED at its JSX use sites, never re-invoked there.
 *
 * The prop-derived inlining pass exists to keep `const a = props.x + 1`
 * reactive: it splices the initializer back in at every JSX use site so each
 * binding re-reads the props getter. That is sound for a pure expression and
 * catastrophic for a stateful factory — `const s = useThing(props.x)` becomes
 * `useThing({…}).open()` inside every `_bind` / `_mountSlot`, so each binding
 * observes its OWN freshly-minted instance while the event handlers mutate the
 * one the component body created. Nothing ever updates, and nothing throws.
 *
 * This shipped twice. `@pyreon/atlas`'s `createModel` was worked around
 * per-site by declaring the binding `let` (the inliner deliberately ignores
 * `let`) — folklore the next author cannot be expected to know, and indeed
 * `@pyreon/loom`'s Observatory then wrote `const`. `@pyreon/zero-content`'s
 * `useSearch` did the same and left the pyreon.dev search overlay dead on
 * every page: Cmd+K toggled a signal that no binding was subscribed to.
 *
 * The guard used to be `STATEFUL_CALLS`, a hand-maintained list of 15 names —
 * i.e. a list of "things that must not be inlined", which is a silent-hole
 * generator: every factory nobody thought to add is re-invoked per use site.
 * It is now backed by the `useX` / `createX` naming convention, so a hook or
 * factory is covered by construction.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

const emit = (c: string): string => transformJSX_JS(c, 'c.tsx').code ?? ''

describe('prop-derived const initialized by a factory call', () => {
  it('does NOT re-invoke a `useX` factory at the JSX use site', () => {
    const out = emit(
      `function C(props){ const s = useThing({ n: props.n }); return <div class={() => s.open() ? 'a' : 'b'}>{() => s.label()}</div> }`,
    )
    // exactly one invocation — the declaration
    expect([...out.matchAll(/useThing\(/g)]).toHaveLength(1)
    expect(out).toMatch(/const s = useThing\(/)
    // both bindings reference the single instance
    expect(out).toContain('s.open()')
    // the text child takes the `_bindText` member-receiver fast path — what
    // matters is that it binds THE instance, not a re-invocation of it
    expect(out).toContain('_bindText(s.label')
  })

  it('does NOT re-invoke a `createX` factory at the JSX use site', () => {
    const out = emit(
      `function C(props){ const m = createModel(props.data); return <div class={() => m.view()}>{() => m.title()}</div> }`,
    )
    expect([...out.matchAll(/createModel\(/g)]).toHaveLength(1)
  })

  it('covers the member form — `Feature.useX(props.q)`', () => {
    const out = emit(
      `function C(props){ const r = Posts.useSearch(props.q); return <div>{() => r.data()}</div> }`,
    )
    expect([...out.matchAll(/useSearch\(/g)]).toHaveLength(1)
  })

  it('still inlines a transitively prop-derived factory arg holder', () => {
    // `opts` is prop-derived and feeds the factory; the FACTORY result is what
    // must not be re-invoked. `opts` itself has no JSX use site here.
    const out = emit(
      `function C(props){ const opts = { n: props.n }; const s = useThing(opts); return <div>{() => s.v()}</div> }`,
    )
    expect([...out.matchAll(/useThing\(/g)]).toHaveLength(1)
  })

  it('SCOPE LIMIT: an unrecognised callee is still inlined, so it stays reactive', () => {
    // Narrowing this too would trade a silent state bug for a silent staleness
    // bug — `cx(props.a)` must keep re-evaluating per binding run.
    const out = emit(
      `function C(props){ const cls = cx(props.a, props.b); return <div class={cls}/> }`,
    )
    expect(out).toContain('cx(props.a, props.b)')
    expect(out).not.toMatch(/_setClass\(__root, cls\)/)
  })

  it('SCOPE LIMIT: a lowercase `use`-prefixed name is not a hook', () => {
    // `useful`, `user`, `used` — the convention requires an uppercase letter
    // right after the prefix.
    const out = emit(`function C(props){ const v = username(props.id); return <div>{v}</div> }`)
    expect(out).toContain('username(props.id)')
  })

  it('a plain prop-derived expression still inlines (the reason the pass exists)', () => {
    const out = emit(`function C(props){ const a = props.x + 1; return <div class={a}/> }`)
    expect(out).toContain('props.x + 1')
  })
})
