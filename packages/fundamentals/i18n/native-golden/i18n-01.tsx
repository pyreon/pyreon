import { createI18n } from '@pyreon/i18n/core'

export function App(){
  const i18n = createI18n(cfg)
  return <Text>{i18n.t('hello')}</Text>
}
