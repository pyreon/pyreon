/**
 * Shared trees for the devtools-registration-on-hydrate locks. The browser
 * spec hydrates the literal server HTML below (runtime-server cannot load in
 * the page); `hydrate-devtools-register.test.tsx` asserts `renderToString`
 * emits exactly these strings, so the two cannot drift.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

export function DevtoolsHeader() {
  return h('header', null, 'Inbox')
}

export function DevtoolsItem(props: { label: string }) {
  return h('li', null, props.label)
}

export function DevtoolsApp() {
  return h(
    'main',
    null,
    h(DevtoolsHeader, null),
    h('ul', null, h(DevtoolsItem, { label: 'one' }), h(DevtoolsItem, { label: 'two' })),
  )
}

export const devtoolsLateOn = signal(false)

export function DevtoolsLateChild() {
  return h('em', null, 'late')
}

export function DevtoolsLate() {
  return h('section', null, () => (devtoolsLateOn() ? h(DevtoolsLateChild, null) : null))
}

export const DEVTOOLS_SSR = {
  app: '<main><header>Inbox</header><ul><li>one</li><li>two</li></ul></main>',
  late: '<section></section>',
} as const
