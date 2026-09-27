import { h } from '@pyreon/core'
import { createI18n } from '@pyreon/i18n'

// One instance, module scope. `i18n.locale` is a real Signal<string> —
// `i18n.t(key, params)` reads it internally, so any accessor calling
// `t()` re-runs automatically when `locale.set(...)` fires.
const i18n = createI18n({
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en: { hello: 'Hello, {{name}}!', items: '{{n}} items', switch: 'Deutsch' },
    de: { hello: 'Hallo, {{name}}!', items: '{{n}} Sachen', switch: 'English' },
    cs: { hello: 'Ahoj, {{name}}!', items: '{{n}} položek', switch: 'English' },
  },
})

const NEXT: Record<string, string> = { en: 'de', de: 'cs', cs: 'en' }

/**
 * The live counterpart to the "Basic Usage" snippet on the i18n docs page —
 * a REAL `createI18n()` instance, not a hand-rolled interpolation regex.
 */
export default function I18nSwitchLocaleTranslate() {
  const cycle = () => i18n.locale.set(NEXT[i18n.locale()] ?? 'en')

  return h('div', { class: 'col' },
    h('div', { class: 'card' },
      h('div', { style: { fontSize: '20px', fontWeight: '600' } },
        () => i18n.t('hello', { name: 'Pyreon' }),
      ),
      h('div', { class: 'muted', style: { marginTop: '4px' } },
        () => i18n.t('items', { n: 42 }),
      ),
    ),
    h('div', { class: 'row' },
      h('button', { onClick: cycle }, () => i18n.t('switch')),
      h('span', { class: 'badge' }, () => i18n.locale()),
    ),
  )
}
