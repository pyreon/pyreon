
import { createI18n } from '@pyreon/i18n'
import { Stack, Text } from '@pyreon/primitives'
const thing = createI18n({ locale: 'en', messages: { en: { hello: 'Hello' } } })
export function C() { return (<Stack><Text>x</Text></Stack>) }
