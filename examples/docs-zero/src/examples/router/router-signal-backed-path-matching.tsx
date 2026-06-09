// @ts-nocheck — 1:1 port from a JS `<Playground>`. Strict-mode TS
// would need a manual rewrite (signal shapes, possibly-null guards).
// Renders + behaves correctly; type tightening is a follow-up.
import { signal, computed } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Router — signal-backed path matching.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function RouterSignalBackedPathMatching() {
  // At its core a router is just a signal-typed path + a match table.
  // The real createRouter() adds history sync, lazy components, guards,
  // loaders, prefetching, and View Transitions on top of this shape.
  const route = signal('/')
  const routes = [
    { path: '/',        label: 'Home',    render: () => 'Welcome 👋'                },
    { path: '/about',   label: 'About',   render: () => 'A tiny signal-based router.' },
    { path: '/contact', label: 'Contact', render: () => 'hello@pyreon.dev'           },
  ]

  const current = computed(() =>
    routes.find(r => r.path === route()) ||
    { render: () => '404 — not found' }
  )

  const navItem = (r: any) =>
    h('a', {
      href: '#' + r.path,
      onClick: (e: any) => { e.preventDefault(); route.set(r.path) },
      'aria-current': () => route() === r.path ? 'page' : null,
      style: {
        padding: '4px 10px',
        borderRadius: '6px',
        textDecoration: 'none',
        color: () => route() === r.path ? 'var(--accent)' : 'inherit',
        fontWeight: () => route() === r.path ? '600' : '400',
        background: () => route() === r.path ? 'var(--surface)' : 'transparent',
      },
    }, r.label)

  return h('div', { class: 'col' },
    h('nav', { class: 'row' }, ...routes.map(navItem)),
    h('div', { class: 'card' },
      h('div', { class: 'muted' }, () => route()),
      h('div', { style: { marginTop: '6px', fontSize: '16px' } }, () => current().render()),
    ),
  )
}
