// Pure-logic unit tests for the nested-routes flattening helpers
// (`flattenRouteTree` / `joinRoutePath`). Hand-built RouteIR trees — no
// emit pipeline — so the flattening contract is verified in isolation before
// either target's dispatch consumes it.

import { describe, expect, it } from 'vitest'
import { flattenRouteTree, hasNestedRoutes, joinRoutePath } from '../route-ir-helpers'
import type { ExprIR, RouteIR } from '../types'

const comp = (name: string): ExprIR => ({ kind: 'identifier', name })
/** Compact view of a flattened entry for assertions. */
const view = (routes: RouteIR[]) =>
  flattenRouteTree(routes).map((e) => ({
    path: e.path,
    component: (e.component as { name: string }).name,
    layout: e.layoutChain.map((c) => (c as { name: string }).name),
    isPattern: e.isPattern,
  }))

describe('joinRoutePath', () => {
  it('concatenates a relative child onto the parent', () => {
    expect(joinRoutePath('/app', 'dashboard')).toBe('/app/dashboard')
    expect(joinRoutePath('/', 'home')).toBe('/home')
    expect(joinRoutePath('/a/b', 'c')).toBe('/a/b/c')
  })

  it('uses an already-absolute child path verbatim', () => {
    expect(joinRoutePath('/app', '/app/settings')).toBe('/app/settings')
  })

  it('collapses empty segments (slash tolerance)', () => {
    expect(joinRoutePath('/app/', 'dashboard')).toBe('/app/dashboard')
    expect(joinRoutePath('', 'x')).toBe('/x')
  })
})

describe('hasNestedRoutes', () => {
  it('true only when some route carries non-empty children', () => {
    expect(hasNestedRoutes([{ path: '/', component: comp('H') }])).toBe(false)
    expect(hasNestedRoutes([{ path: '/', component: comp('H'), children: [] }])).toBe(false)
    expect(
      hasNestedRoutes([
        { path: '/app', component: comp('L'), children: [{ path: 'x', component: comp('X') }] },
      ]),
    ).toBe(true)
  })
})

describe('flattenRouteTree', () => {
  it('passes flat routes through unchanged (empty layoutChain)', () => {
    const routes: RouteIR[] = [
      { path: '/', component: comp('Home') },
      { path: '/about', component: comp('About') },
    ]
    expect(view(routes)).toEqual([
      { path: '/', component: 'Home', layout: [], isPattern: false },
      { path: '/about', component: 'About', layout: [], isPattern: false },
    ])
  })

  it('flattens a 2-level layout: index entry + each child wrapped by the layout', () => {
    const routes: RouteIR[] = [
      {
        path: '/app',
        component: comp('AppLayout'),
        children: [
          { path: 'dashboard', component: comp('Dashboard') },
          { path: 'settings', component: comp('Settings') },
        ],
      },
    ]
    expect(view(routes)).toEqual([
      // The layout's own path renders the layout alone (no wrap above it).
      { path: '/app', component: 'AppLayout', layout: [], isPattern: false },
      { path: '/app/dashboard', component: 'Dashboard', layout: ['AppLayout'], isPattern: false },
      { path: '/app/settings', component: 'Settings', layout: ['AppLayout'], isPattern: false },
    ])
  })

  it('nests 3 levels — layoutChain accumulates outermost-first', () => {
    const routes: RouteIR[] = [
      {
        path: '/app',
        component: comp('AppLayout'),
        children: [
          {
            path: 'team',
            component: comp('TeamLayout'),
            children: [{ path: 'members', component: comp('Members') }],
          },
        ],
      },
    ]
    expect(view(routes)).toEqual([
      { path: '/app', component: 'AppLayout', layout: [], isPattern: false },
      { path: '/app/team', component: 'TeamLayout', layout: ['AppLayout'], isPattern: false },
      {
        path: '/app/team/members',
        component: 'Members',
        layout: ['AppLayout', 'TeamLayout'],
        isPattern: false,
      },
    ])
  })

  it('a pure-grouping layout (no component) contributes no index + does not wrap', () => {
    const routes: RouteIR[] = [
      {
        path: '/group',
        children: [{ path: 'a', component: comp('A') }],
      },
    ]
    expect(view(routes)).toEqual([
      // No index entry for /group (it has no component); child is NOT wrapped.
      { path: '/group/a', component: 'A', layout: [], isPattern: false },
    ])
  })

  it('carries the leaf guard through to the flattened entry', () => {
    const routes: RouteIR[] = [
      {
        path: '/app',
        component: comp('AppLayout'),
        children: [{ path: 'admin', component: comp('Admin'), guard: comp('isAuthed') }],
      },
    ]
    const flat = flattenRouteTree(routes)
    const admin = flat.find((e) => e.path === '/app/admin')!
    expect((admin.guard as { name: string }).name).toBe('isAuthed')
    expect(admin.layoutChain.map((c) => (c as { name: string }).name)).toEqual(['AppLayout'])
  })

  it('conservatively bails nested :param / redirect / wildcard children', () => {
    const routes: RouteIR[] = [
      {
        path: '/app',
        component: comp('AppLayout'),
        children: [
          { path: ':id', component: comp('Detail') }, // nested param → bail
          { path: 'old', redirect: '/app/new' }, // nested redirect → bail
          { path: '*', component: comp('NF') }, // nested wildcard → bail
          { path: 'ok', component: comp('Ok') }, // literal → kept
        ],
      },
    ]
    expect(view(routes)).toEqual([
      { path: '/app', component: 'AppLayout', layout: [], isPattern: false },
      { path: '/app/ok', component: 'Ok', layout: ['AppLayout'], isPattern: false },
    ])
  })

  it('top-level :param route flattens with isPattern=true', () => {
    const routes: RouteIR[] = [{ path: '/users/:id', component: comp('User') }]
    expect(view(routes)).toEqual([
      { path: '/users/:id', component: 'User', layout: [], isPattern: true },
    ])
  })
})
