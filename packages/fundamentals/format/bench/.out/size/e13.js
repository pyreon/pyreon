const cache = new Map()
const get = (C, l, o) => { const k = C.name + l + JSON.stringify(o); let f = cache.get(k); if (!f) cache.set(k, (f = new C(l, o))); return f }
console.log(get(Intl.DateTimeFormat, 'en-US', { dateStyle: 'medium' }).format(new Date(2026, 10, 18)))
