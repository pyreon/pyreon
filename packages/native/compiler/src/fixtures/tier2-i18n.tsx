// Tier-2 Strategy-B fixture for @pyreon/i18n/core (Gap 4 PR-3 → v2).
//
// Verified scope:
//   - createI18n({ locale, messages, fallbackLocale? }) → PyreonI18n
//   - i18n.t("key") lookup with fallback-locale chain
//   - i18n.t("key", { name: 'Ada' }) INTERPOLATION — the object-literal
//     values argument lowers to a dictionary/map at this call shape
//     (Swift `["name": "Ada"]` / Kotlin `mapOf("name" to "Ada")`), and
//     the runtime's two-arg overload does the `{{name}}` replacement
//   - i18n.t("items", { count: n() }) PLURALS — the runtime resolves
//     `items_one` / `items_other` from the `count` value (v1: en-style
//     one/other; full Intl.PluralRules category parity is a documented
//     follow-up)
//   - i18n.locale read (plain property access)
//
// Deferred (documented follow-ups, each its own PR):
//   - i18n.setLocale("de") / i18n.locale.set("de") writes
//   - Plural categories beyond one/other (few/many/zero)
//   - Async namespace loading
//   - <Trans> component for rich JSX interpolation

import { createI18n } from '@pyreon/i18n/core'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'

export function Greeting() {
  const i18n = createI18n({
    locale: 'en',
    fallbackLocale: 'en',
    messages: {
      en: {
        hello: 'Hello!',
        farewell: 'Goodbye',
        greet: 'Hello {{name}}!',
        items_one: '{{count}} item',
        items_other: '{{count}} items',
      },
      de: {
        hello: 'Hallo!',
        farewell: 'Auf Wiedersehen',
        greet: 'Hallo {{name}}!',
        items_one: '{{count}} Eintrag',
        items_other: '{{count}} Einträge',
      },
    },
  })

  const count = signal<number>(2)

  return (
    <Stack>
      <Text>{i18n.t('hello')}</Text>
      <Text>{i18n.t('farewell')}</Text>
      <Text>{i18n.t('greet', { name: 'Ada' })}</Text>
      <Text>{i18n.t('items', { count: count() })}</Text>
    </Stack>
  )
}
