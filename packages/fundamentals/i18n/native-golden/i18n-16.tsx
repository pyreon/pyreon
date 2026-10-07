import { createI18n } from '@pyreon/i18n/core'
import { signal } from '@pyreon/reactivity'
export function App(){
  const i18n = createI18n({ locale: 'en', messages: { en: { a: 'x {{n}}' } } })
  const rows = signal([{ id: 1, label: 'a' }])
  const more = { n: 1 }
  return <Text>{i18n.t('a', { ...more })}{i18n.foo('a', { n: 1 })}{i18n.t('a', { n: rows()[0].id })}{rows()[0].label}</Text>
}
