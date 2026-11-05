// `planTabs` / `planSplitSidebar` / `planRouterTabs` are shared by both emitters, so every shape they REFUSE is refused
// on iOS and Android alike — and each refusal is a screen the user could otherwise never reach, so it must be named.
// The emit-level tests cover the happy path; this pins every refusal reason at the plan level.

import { describe, expect, it } from 'vitest'
import { missingTabRootWarning, planRouterTabs, planSplitSidebar, planTabs, tabRootRoute } from '../navigation-lowering'
import type { ExprIR, RouteIR } from '../types'

type Attr = { kind: 'attr'; name: string; value: ExprIR }
const lit = (value: unknown): ExprIR => ({ kind: 'literal', value }) as ExprIR
const attr = (name: string, value: ExprIR): Attr => ({ kind: 'attr', name, value })
const el = (tag: string, attrs: Attr[] = [], children: unknown[] = []) =>
  ({ kind: 'jsx-element', tag, attrs, children }) as unknown as Extract<ExprIR, { kind: 'jsx-element' }>
const child = (e: ExprIR) => ({ kind: 'expr', expr: e })
const text = (value: string) => ({ kind: 'text', value })
const tab = (value: ExprIR | undefined, extra: Attr[] = [], children: unknown[] = []) =>
  child(el('Tab', [...(value ? [attr('value', value)] : []), ...extra], children))

describe('planTabs refusals', () => {
  it('a non-Tab element, a text child and a non-JSX expression are each named and dropped', () => {
    const { tabs, warnings } = planTabs(
      el('Tabs', [], [text('  \n'), child(el('For')), text('stray'), child({ kind: 'identifier', name: 'x' } as ExprIR)]),
    )
    expect(tabs).toEqual([])
    expect(warnings).toHaveLength(3)
    expect(warnings[0]).toContain('this <For> is DROPPED')
    expect(warnings[1]).toContain('this text is DROPPED')
    expect(warnings[2]).toContain('this `identifier` expression is DROPPED')
  })

  it('a computed value, a missing value, and a duplicate value are named', () => {
    const { tabs, warnings } = planTabs(
      el('Tabs', [], [
        tab({ kind: 'identifier', name: 'v' } as ExprIR),
        tab(undefined),
        tab(lit('a'), [attr('label', lit('A'))]),
        tab(lit('a'), [attr('label', lit('A again'))]),
      ]),
    )
    expect(tabs.map((t) => t.value)).toEqual(['a'])
    expect(warnings.filter((w) => w.includes('`value` must be a string LITERAL'))).toHaveLength(2)
    expect(warnings.some((w) => w.includes('a second tab with the same value is DROPPED'))).toBe(true)
  })

  it('a missing label falls back to the value, a computed label is kept as an expression', () => {
    const computed = { kind: 'identifier', name: 'title' } as ExprIR
    const { tabs, warnings } = planTabs(el('Tabs', [], [tab(lit('home')), tab(lit('feed'), [attr('label', computed)])]))
    expect(tabs[0]!.label).toEqual({ kind: 'literal', text: 'home' })
    expect(warnings[0]).toContain('no `label`')
    expect(tabs[1]!.label).toEqual({ kind: 'expr', expr: computed })
  })

  it('an unknown icon passes through with a warning; a computed icon is dropped with a warning', () => {
    const { tabs, warnings } = planTabs(
      el('Tabs', [], [
        tab(lit('a'), [attr('label', lit('A')), attr('icon', lit('not-a-real-icon'))]),
        tab(lit('b'), [attr('label', lit('B')), attr('icon', { kind: 'identifier', name: 'i' } as ExprIR)]),
      ]),
    )
    expect(tabs[0]!.icon).toEqual({ sf: 'not-a-real-icon', material: 'Warning' })
    expect(warnings[0]).toContain('not in the canonical icon map')
    expect(tabs[1]!.icon).toBeUndefined()
    expect(warnings[1]).toContain('`icon` must be a string literal')
  })

  it('a test id is carried and blank-text children are stripped from the tab body', () => {
    const body = child(el('Text'))
    const { tabs } = planTabs(el('Tabs', [], [tab(lit('a'), [attr('label', lit('A')), attr('data-testid', lit('tab-a'))], [text(' '), body])]))
    expect(tabs[0]!.testId).toBe('tab-a')
    expect(tabs[0]!.children).toEqual([body])
  })
})

describe('planSplitSidebar', () => {
  it('no sidebar is named', () => {
    const p = planSplitSidebar(el('Split'))
    expect(p.kind).toBe('unsupported')
  })

  it('a JSX element, a fragment, and a zero-arg accessor returning either all lower', () => {
    const list = el('List')
    expect(planSplitSidebar(el('Split', [attr('sidebar', list)]))).toEqual({ kind: 'view', children: [child(list)] })
    const frag = { kind: 'jsx-fragment', children: [child(list)] } as unknown as ExprIR
    expect(planSplitSidebar(el('Split', [attr('sidebar', frag)]))).toEqual({ kind: 'view', children: [child(list)] })
    const arrow = { kind: 'arrow', params: [], body: list } as unknown as ExprIR
    expect(planSplitSidebar(el('Split', [attr('sidebar', arrow)]))).toEqual({ kind: 'view', children: [child(list)] })
  })

  it('an accessor with statements, an accessor with params, and a non-JSX value are named', () => {
    const list = el('List')
    for (const v of [
      { kind: 'arrow', params: [], stmts: [{ kind: 'expr', expr: lit(1) }], body: list },
      { kind: 'arrow', params: ['x'], body: list },
      { kind: 'identifier', name: 'pane' },
    ]) {
      const p = planSplitSidebar(el('Split', [attr('sidebar', v as unknown as ExprIR)]))
      expect(p.kind).toBe('unsupported')
      expect((p as { warning: string }).warning).toContain('only a JSX literal')
    }
  })
})

describe('planRouterTabs / tabRootRoute', () => {
  it('a tab naming no router tab is dropped and named, listing the configured tabs', () => {
    const { tabs, warnings } = planRouterTabs(
      el('Tabs', [], [tab(lit('home'), [attr('label', lit('H'))]), tab(lit('ghost'), [attr('label', lit('G'))])]),
      [{ name: 'home', root: '/' }, { name: 'feed', root: '/feed' }],
    )
    expect(tabs.map((t) => t.value)).toEqual(['home'])
    expect(warnings[0]).toContain('<Tab value="ghost"> names no tab of the router (configured: "home", "feed")')
  })

  it('a tab root matches the top-level literal route by normalised path, never a parameterised one', () => {
    const routes = [
      { path: '/feed/', component: 'Feed' },
      { path: '/user/:id', component: 'User' },
    ] as unknown as RouteIR[]
    expect(tabRootRoute(routes, 'feed')?.path).toBe('/feed/')
    expect(tabRootRoute(routes, '/user/:id')).toBeUndefined()
    expect(missingTabRootWarning({ name: 'me', root: '/me' })).toContain('tab "me" has root "/me", which matches no top-level literal route')
  })
})
