import { formatNumber, formatCurrency, formatBytes, formatDuration, formatDate, formatRelativeTo, formatList } from '../../../lib/core.js'
const o = { locale: 'en-US' }
console.log(formatNumber(1234.5, o), formatCurrency(9.99, 'EUR', o), formatBytes(1536, o), formatDuration(3905000, o), formatDate('2026-11-18', o), formatRelativeTo(1000, 301000, o), formatList(['a', 'b'], o))
