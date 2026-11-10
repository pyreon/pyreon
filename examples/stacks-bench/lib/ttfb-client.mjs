// Single-connection latency client, run as its OWN node process (never inside
// the harness or the server): `node ttfb-client.mjs <url> <n>`.
// One keep-alive socket, strictly sequential requests, no Accept-Encoding.
// TTFB = request written → response headers parsed (the first bytes of the
// response); TTLB = → last body byte. Prints JSON { ttfb: ms[], ttlb: ms[], bytes }.
import http from 'node:http'

const [url, nRaw] = process.argv.slice(2)
const n = Number(nRaw ?? 200)
const agent = new http.Agent({ keepAlive: true, maxSockets: 1 })
const ttfb = []
const ttlb = []
let bytes = 0

function once() {
  return new Promise((resolve, reject) => {
    const t0 = process.hrtime.bigint()
    const req = http.get(url, { agent }, (res) => {
      const t1 = process.hrtime.bigint()
      let len = 0
      res.on('data', (c) => (len += c.length))
      res.on('end', () => {
        const t2 = process.hrtime.bigint()
        if (res.statusCode !== 200) return reject(new Error(`status ${res.statusCode}`))
        bytes = len
        resolve([Number(t1 - t0) / 1e6, Number(t2 - t0) / 1e6])
      })
    })
    req.on('error', reject)
  })
}

for (let i = 0; i < n; i++) {
  const [a, b] = await once()
  ttfb.push(a)
  ttlb.push(b)
}
agent.destroy()
process.stdout.write(JSON.stringify({ ttfb, ttlb, bytes }))
