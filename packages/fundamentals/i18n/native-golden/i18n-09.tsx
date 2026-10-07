import { createI18n } from '@pyreon/i18n'
import { Stack, Text } from '@pyreon/primitives'
const DEFAULT_LOCALE = 'en'
export function C() {
  const i = createI18n({ locale: DEFAULT_LOCALE, messages: { en: { hi: 'Hi' } } })
  return <Stack><Text>x</Text></Stack>
}
