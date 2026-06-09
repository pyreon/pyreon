// Tier-2 Strategy-B fixture for @pyreon/i18n/core (Gap 4 PR-3, v1).
//
// v1 scope verified:
//   - createI18n({ locale, messages, fallbackLocale? }) → PyreonI18n
//   - i18n.t("key") lookup with fallback-locale chain
//   - i18n.locale read (plain property access)
//
// Deferred (documented follow-ups, each its own PR):
//   - i18n.t("key", { name: "Alice" }) interpolation values
//   - i18n.setLocale("de") / i18n.locale.set("de") writes
//   - Pluralization (_one / _other suffixes)
//   - Async namespace loading
//   - <Trans> component for rich JSX interpolation

import { createI18n } from '@pyreon/i18n/core'
import { Stack, Text } from '@pyreon/primitives'

export function Greeting() {
  const i18n = createI18n({
    locale: 'en',
    fallbackLocale: 'en',
    messages: {
      en: {
        hello: 'Hello!',
        farewell: 'Goodbye',
      },
      de: {
        hello: 'Hallo!',
        farewell: 'Auf Wiedersehen',
      },
    },
  })

  return (
    <Stack>
      <Text>{i18n.t('hello')}</Text>
      <Text>{i18n.t('farewell')}</Text>
    </Stack>
  )
}
