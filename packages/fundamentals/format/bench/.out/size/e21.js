import { createIntl, createIntlCache } from '@formatjs/intl'
import prettyBytes from 'pretty-bytes'
import prettyMilliseconds from 'pretty-ms'
const intl = createIntl({ locale: 'en-US' }, createIntlCache())
console.log(intl.formatNumber(1234.5), intl.formatNumber(9.99, { style: 'currency', currency: 'EUR' }), prettyBytes(1536), prettyMilliseconds(3905000), intl.formatDate(new Date(2026, 10, 18)), intl.formatRelativeTime(-5, 'minute'), intl.formatList(['a', 'b']))
