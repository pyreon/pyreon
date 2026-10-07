import { Stack, Text } from '@pyreon/primitives'
import { createI18n } from '@pyreon/i18n'
export function App() {
  const i = createI18n({ locale: 'en', messages: { en: { hi: 'Hi' }, cs: {} }, fallbackLocale: 'en' })
  return (<Stack><Text>{i.t('hi')}</Text></Stack>)
}
