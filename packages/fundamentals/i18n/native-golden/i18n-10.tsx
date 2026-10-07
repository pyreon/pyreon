import { createI18n } from '@pyreon/i18n'
       import { Stack, Text } from '@pyreon/primitives'
       export function C() {
         const i = createI18n({ locale: 'en', messages: { en: { hi: 'Hi' } } })
         return (<Stack><Text>{i.t('hi')}</Text></Stack>)
       }
