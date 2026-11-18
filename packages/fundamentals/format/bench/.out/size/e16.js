import { createIntl, createIntlCache } from '@formatjs/intl'
const intl = createIntl({ locale: 'en-US' }, createIntlCache())
console.log(intl.formatRelativeTime(-5, 'minute'))
