
import { createI18n } from '@pyreon/i18n/core'
import { Stack, Text } from '@pyreon/primitives'

export function Hello() {
  const i18n = createI18n({ locale: 'en', messages: { en: { hi: 'Hi' } } })
  return <Stack><Text>{i18n.t('hi')}</Text></Stack>
}
