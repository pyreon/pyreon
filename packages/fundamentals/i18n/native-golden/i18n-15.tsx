import { createI18n } from '@pyreon/i18n/core'
export function App(){
  const i18n = createI18n({
    locale: 'en',
    [dynConfig]: 'x',
    messages: {
      [dynLocale]: { hello: 'Hi' },
      en: { [dynKey]: 'Hi', hello: 'Hello' },
    },
  })
  return <Text>{i18n.t('hello')}</Text>
}
