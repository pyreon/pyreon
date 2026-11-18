import { formatNumber, formatCurrency, formatBytes, formatDuration, formatDate, formatRelativeTo, formatList } from '../../../lib/index.js'
console.log(formatNumber(1234.5), formatCurrency(9.99, 'EUR'), formatBytes(1536), formatDuration(3905000), formatDate('2026-11-18'), formatRelativeTo(1000, 301000), formatList(['a', 'b']))
