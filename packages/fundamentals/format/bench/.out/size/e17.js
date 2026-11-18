const cache = new Map()
const get = (C, l, o) => { const k = C.name + l + JSON.stringify(o); let f = cache.get(k); if (!f) cache.set(k, (f = new C(l, o))); return f }
console.log(get(Intl.RelativeTimeFormat, 'en-US', { numeric: 'auto' }).format(-5, 'minute'))
