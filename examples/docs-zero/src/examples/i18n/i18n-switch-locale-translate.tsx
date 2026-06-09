// @ts-nocheck — 1:1 port from a JS `<Playground>`. Strict-mode TS
// would need a manual rewrite (signal shapes, possibly-null guards).
// Renders + behaves correctly; type tightening is a follow-up.
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — i18n — switch locale, translate.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function I18nSwitchLocaleTranslate() {
  // Reading t(key) inside a thunk subscribes to locale changes.
  // The real createI18n() adds plural rules, interpolation, namespace
  // lazy-loading, and SSR streaming on top of this shape.
  const locale = signal('en')
  const messages = {
    en: { hello: 'Hello, {name}!', items: '{n} items', switch: 'Deutsch' },
    de: { hello: 'Hallo, {name}!', items: '{n} Sachen',  switch: 'English' },
    cs: { hello: 'Ahoj, {name}!',  items: '{n} položek', switch: 'English' },
  }
  const t = (key: any, params = {}) =>
    String((messages as Record<string, any>)[locale()]?.[key] ?? key)
      .replace(/\{(\w+)\}/g, (_, k) => (params as Record<string, any>)[k] ?? '')

  const cycle = () => locale.set({ en: 'de', de: 'cs', cs: 'en' }[locale()])

  return h('div', { class: 'col' },
    h('div', { class: 'card' },
      h('div', { style: { fontSize: '20px', fontWeight: '600' } },
        () => t('hello', { name: 'Pyreon' }),
      ),
      h('div', { class: 'muted', style: { marginTop: '4px' } },
        () => t('items', { n: 42 }),
      ),
    ),
    h('div', { class: 'row' },
      h('button', { onClick: cycle }, () => t('switch')),
      h('span', { class: 'badge' }, () => locale()),
    ),
  )
}
