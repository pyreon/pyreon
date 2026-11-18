import { createIntl, createIntlCache } from '@formatjs/intl'
const intl = createIntl({ locale: 'en-US' }, createIntlCache())
console.log(intl.formatDate(new Date(2026, 10, 18)))
