import { createI18n } from '@pyreon/i18n'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const i18n = createI18n({ locale: 'en', messages: { en: { hi: 'Hi' }, cs: {} } })
  return (<Stack><Text>{i18n.t('hi')}</Text></Stack>)
}
