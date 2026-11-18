import { createIntl, createIntlCache } from '@formatjs/intl'
const intl = createIntl({ locale: 'en-US' }, createIntlCache())
console.log(intl.formatNumber(1234.5))
