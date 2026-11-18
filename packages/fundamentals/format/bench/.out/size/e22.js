const cache = new Map()
const get = (C, l, o) => { const k = C.name + l + JSON.stringify(o); let f = cache.get(k); if (!f) cache.set(k, (f = new C(l, o))); return f }
import prettyBytes from 'pretty-bytes'
import prettyMilliseconds from 'pretty-ms'
console.log(get(Intl.NumberFormat, 'en-US').format(1234.5), get(Intl.NumberFormat, 'en-US', { style: 'currency', currency: 'EUR' }).format(9.99), prettyBytes(1536), prettyMilliseconds(3905000), get(Intl.DateTimeFormat, 'en-US', { dateStyle: 'medium' }).format(new Date(2026, 10, 18)), get(Intl.RelativeTimeFormat, 'en-US', { numeric: 'auto' }).format(-5, 'minute'), get(Intl.ListFormat, 'en-US').format(['a', 'b']))
