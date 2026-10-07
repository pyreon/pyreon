import { createI18n } from '@pyreon/i18n/core'

export function App(){
  const i18n = createI18n({ locale: l, messages: {} })
  return <Text>{i18n.t('hello')}</Text>
}
