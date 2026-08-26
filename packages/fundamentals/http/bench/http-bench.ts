/**
 * @pyreon/http vs ky vs ofetch vs redaxios vs axios — objective head-to-head
 * on the per-request WRAPPER hot path, with a bare-`fetch` floor.
 *
 * Run: `bun run bench:http` (sets NODE_ENV=production).
 *
 * Objectivity contract (mirrors bench/storage-bench.ts):
 *  - NODE_ENV=production set by the npm script's SHELL before the process
 *    starts (in-file assignment below covers direct invocation).
 *  - Idiomatic per library — each lib called the way ITS docs show
 *    (`api.get(path).json()` for pyreon/ky, `api(path)` for ofetch,
 *    `.data` for redaxios/axios).
 *  - FAIR TRANSPORT: every lib goes through the SAME stubbed
 *    `globalThis.fetch` returning a fresh in-memory `Response` per call —
 *    so rows isolate the WRAPPER's JS (URL build, header merge, option
 *    resolution, signal composition, body decode plumbing), not the
 *    network. Every lib pays the identical native Response/body cost.
 *    axios is pinned to its `fetch` adapter (its Node default is the
 *    `http` adapter, which would bypass the stub → the gate catches it).
 *  - TIMEOUT PARITY: base clients disable timeouts explicitly where a lib
 *    has a default (pyreon 30s, ky 10s) because ofetch/redaxios/axios
 *    default to none — the composed-signal tax is measured by its OWN row
 *    (`GET with 5s timeout`) for the libs that support timeouts at all.
 *  - CORRECTNESS GATE asserts all libs decode the same body, serialize the
 *    same POST body + content-type, and produce the same query string
 *    (scalar params only — array encoding legitimately differs per lib)
 *    before any timing.
 *  - PER-(OP × IMPL) PROCESS ISOLATION — each cell runs in a fresh `bun`
 *    child so no lib measures after another's JIT/heap debt.
 *  - NO forced GC (JSC re-tier noise). Warmup + pooled small runs across
 *    ${BENCH_REPEATS:-3} spawns; median + 95% bootstrap CI + 🤝 tie marker.
 *  - A `sink` defeats DCE.
 *  - `BENCH_GATE_ONLY=1` runs the correctness gate and exits 0 without timing —
 *    use it to check correctness on a loaded machine, where timings are worthless.
 *
 * HONEST FRAMING (don't cherry-pick):
 *  - This is a CPU-objective micro-bench of wrapper overhead. In the
 *    browser against a real network the wrapper is noise for a single
 *    request; the path matters at SSR/loader fan-out volume and under
 *    `@pyreon/query`, whose transport this is.
 *  - `bare` is the no-feature floor (hand-rolled fetch + JSON.parse), NOT
 *    a competitor — it shows how much headroom exists above the floor.
 *  - redaxios/axios ALWAYS read + parse the body (no raw-response mode),
 *    so they structurally do the full decode on every row — that is their
 *    design, disclosed, not a rigged row.
 */
process.env.NODE_ENV = 'production'

import axiosDefault from 'axios'
// ky 2. `prefixUrl` was renamed to `prefix`; v2's docs recommend `baseUrl` for
// most new code, but `prefix` is the exact semantic equivalent of v1's
// `prefixUrl`, so this arm measures the VERSION change rather than a config
// change alongside it.
import ky from 'ky'
import { ofetch } from 'ofetch'
import redaxios from 'redaxios'
import { createHttp } from '../src/client'

declare const Bun: {
  spawnSync: (
    cmd: string[],
    opts: { env: Record<string, string | undefined> },
  ) => { stdout: Uint8Array; exitCode: number }
}

const now = () => Number(process.hrtime.bigint())

// ── the shared stub transport (every lib routes through this) ────────────────
const BODY = '{"id":1,"name":"Ada","ok":true}'
interface Captured {
  url: string
  method: string
  contentType: string | null
  bodyText: string | null
}
let captured: Captured | null = null
let captureNext = false

const realRequest = globalThis.Request

globalThis.fetch = (async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  if (captureNext) {
    captureNext = false
    if (typeof realRequest !== 'undefined' && input instanceof realRequest) {
      captured = {
        url: input.url,
        method: input.method,
        contentType: input.headers.get('content-type'),
        bodyText: input.method === 'GET' ? null : await input.clone().text(),
      }
    } else {
      const headers = new Headers(init?.headers)
      captured = {
        url: String(input),
        method: init?.method ?? 'GET',
        contentType: headers.get('content-type'),
        bodyText: typeof init?.body === 'string' ? init.body : null,
      }
    }
  }
  return new Response(BODY, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}) as typeof fetch

const BASE = 'https://api.example.com/v1'

// ── idiomatic clients (created once per child; creation has its own row) ─────
function makeClients() {
  return {
    pyreon: createHttp({
      baseUrl: BASE,
      headers: { 'x-app': 'bench' },
      timeout: false,
    }),
    ky: ky.create({
      prefix: BASE,
      headers: { 'x-app': 'bench' },
      timeout: false,
      retry: 0,
    }),
    ofetch: ofetch.create({ baseURL: BASE, headers: { 'x-app': 'bench' } }),
    redaxios: redaxios.create({ baseURL: BASE, headers: { 'x-app': 'bench' } }),
    axios: axiosDefault.create({
      baseURL: BASE,
      headers: { 'x-app': 'bench' },
      adapter: 'fetch',
    }),
  }
}

function measureSamplesAsync(
  fn: () => Promise<void>,
  { warmup = 3_000, iters = 1_000, runs = 31 }: {
    warmup?: number
    iters?: number
    runs?: number
  } = {},
): Promise<number[]> {
  return (async () => {
    for (let i = 0; i < warmup; i++) await fn()
    const samples: number[] = []
    for (let r = 0; r < runs; r++) {
      const t0 = now()
      for (let i = 0; i < iters; i++) await fn()
      samples.push((now() - t0) / iters)
    }
    return samples
  })()
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[s.length >> 1] as number
}

function bootstrapCI(samples: number[], resamples = 2_000): [number, number] {
  const meds: number[] = []
  const n = samples.length
  for (let r = 0; r < resamples; r++) {
    const re: number[] = []
    for (let i = 0; i < n; i++) re.push(samples[(Math.random() * n) | 0] as number)
    meds.push(median(re))
  }
  meds.sort((a, b) => a - b)
  return [meds[(resamples * 0.025) | 0] as number, meds[(resamples * 0.975) | 0] as number]
}

const overlaps = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1]

let sink = 0
const IMPLS = ['pyreon', 'ky', 'ofetch', 'redaxios', 'axios', 'bare'] as const
type ImplName = (typeof IMPLS)[number]
type Impl = Record<ImplName, () => Promise<void>>

// ── ops ──────────────────────────────────────────────────────────────────────
interface OpSpec {
  note?: string
  make: () => Impl
  iters?: number
  /**
   * Libraries that CANNOT express this row's feature. Their cell is printed
   * `n/a` and never measured. Running their plain no-feature call instead and
   * printing a ratio would be a fabricated comparison: the number would look
   * like "redaxios is faster at timeouts" when redaxios did no timeout work at
   * all. `n/a` is the honest cell — a missing feature is not a fast feature.
   */
  na?: readonly ImplName[]
}

const OPS: Record<string, OpSpec> = {
  'GET → decoded JSON': {
    note: 'the headline row — full idiomatic request + body decode per lib',
    make: () => {
      const c = makeClients()
      return {
        pyreon: async () => {
          const d = (await c.pyreon.get('users/1').json()) as { id: number }
          sink += d.id
        },
        ky: async () => {
          const d = (await c.ky.get('users/1').json()) as { id: number }
          sink += d.id
        },
        ofetch: async () => {
          const d = (await c.ofetch<{ id: number }>('/users/1'))
          sink += d.id
        },
        redaxios: async () => {
          const r = await c.redaxios.get('/users/1')
          sink += (r.data as { id: number }).id
        },
        axios: async () => {
          const r = await c.axios.get<{ id: number }>('/users/1')
          sink += r.data.id
        },
        bare: async () => {
          const r = await fetch(`${BASE}/users/1`, { headers: { 'x-app': 'bench' } })
          const d = JSON.parse(await r.text()) as { id: number }
          sink += d.id
        },
      }
    },
  },
  'POST json → decoded JSON': {
    note: 'body serialization + content-type + decode',
    make: () => {
      const c = makeClients()
      const payload = { name: 'Ada', role: 'admin' }
      return {
        pyreon: async () => {
          const d = (await c.pyreon.post('users', { json: payload }).json()) as { id: number }
          sink += d.id
        },
        ky: async () => {
          const d = (await c.ky.post('users', { json: payload }).json()) as { id: number }
          sink += d.id
        },
        ofetch: async () => {
          const d = await c.ofetch<{ id: number }>('/users', {
            method: 'POST',
            body: payload,
          })
          sink += d.id
        },
        redaxios: async () => {
          const r = await c.redaxios.post('/users', payload)
          sink += (r.data as { id: number }).id
        },
        axios: async () => {
          const r = await c.axios.post<{ id: number }>('/users', payload)
          sink += r.data.id
        },
        bare: async () => {
          const r = await fetch(`${BASE}/users`, {
            method: 'POST',
            headers: { 'x-app': 'bench', 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
          const d = JSON.parse(await r.text()) as { id: number }
          sink += d.id
        },
      }
    },
  },
  'GET + 3 scalar query params': {
    note: 'query serialization (scalars only — array encoding differs per lib)',
    make: () => {
      const c = makeClients()
      const q = { page: 2, q: 'ada', limit: 10 }
      return {
        pyreon: async () => {
          const d = (await c.pyreon.get('users', { query: q }).json()) as { id: number }
          sink += d.id
        },
        ky: async () => {
          const d = (await c.ky.get('users', { searchParams: q }).json()) as { id: number }
          sink += d.id
        },
        ofetch: async () => {
          const d = await c.ofetch<{ id: number }>('/users', { query: q })
          sink += d.id
        },
        redaxios: async () => {
          const r = await c.redaxios.get('/users', { params: q })
          sink += (r.data as { id: number }).id
        },
        axios: async () => {
          const r = await c.axios.get<{ id: number }>('/users', { params: q })
          sink += r.data.id
        },
        bare: async () => {
          const s = new URLSearchParams()
          s.append('page', '2')
          s.append('q', 'ada')
          s.append('limit', '10')
          const r = await fetch(`${BASE}/users?${s.toString()}`, {
            headers: { 'x-app': 'bench' },
          })
          const d = JSON.parse(await r.text()) as { id: number }
          sink += d.id
        },
      }
    },
  },
  'GET with 5s timeout': {
    note: 'composed cancel signal + timer per request. redaxios = n/a: no first-class per-client timeout over fetch, so there is nothing comparable to measure (it previously ran a PLAIN GET here, doing none of the work this row exists to measure, while still printing a ratio).',
    na: ['redaxios'],
    make: () => {
      const pyreonT = createHttp({ baseUrl: BASE, timeout: 5_000 })
      const kyT = ky.create({ prefix: BASE, timeout: 5_000, retry: 0 })
      const ofetchT = ofetch.create({ baseURL: BASE, timeout: 5_000 })
      const bareImpl = async () => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 5_000)
        try {
          const r = await fetch(`${BASE}/users/1`, { signal: controller.signal })
          const d = JSON.parse(await r.text()) as { id: number }
          sink += d.id
        } finally {
          clearTimeout(timer)
        }
      }
      return {
        pyreon: async () => {
          const d = (await pyreonT.get('users/1').json()) as { id: number }
          sink += d.id
        },
        ky: async () => {
          const d = (await kyT.get('users/1').json()) as { id: number }
          sink += d.id
        },
        ofetch: async () => {
          const d = await ofetchT<{ id: number }>('/users/1')
          sink += d.id
        },
        // redaxios has no first-class per-client timeout over fetch. Marked
        // `na` above so this cell is never measured; the body throws so it can
        // never be silently re-enabled as a plain GET masquerading as a timeout.
        redaxios: async () => {
          throw new Error('n/a — redaxios has no per-client timeout over fetch')
        },
        axios: async () => {
          const r = await axiosDefault.get<{ id: number }>(`${BASE}/users/1`, {
            adapter: 'fetch',
            timeout: 5_000,
          })
          sink += r.data.id
        },
        bare: bareImpl,
      }
    },
  },
  'create configured client': {
    note: 'factory cost — baseUrl + 1 header + defaults folding. EVERY lib gets the SAME `x-app` header (redaxios/axios previously got baseURL only, skipping the header-merge this row exists to measure).',
    iters: 2_000,
    make: () => ({
      pyreon: async () => {
        const c = createHttp({ baseUrl: BASE, headers: { 'x-app': 'bench' } })
        sink += typeof c.get === 'function' ? 1 : 0
      },
      ky: async () => {
        const c = ky.create({ prefix: BASE, headers: { 'x-app': 'bench' } })
        sink += typeof c.get === 'function' ? 1 : 0
      },
      ofetch: async () => {
        const c = ofetch.create({ baseURL: BASE, headers: { 'x-app': 'bench' } })
        sink += typeof c === 'function' ? 1 : 0
      },
      redaxios: async () => {
        const c = redaxios.create({ baseURL: BASE, headers: { 'x-app': 'bench' } })
        sink += typeof c.get === 'function' ? 1 : 0
      },
      axios: async () => {
        const c = axiosDefault.create({
          baseURL: BASE,
          headers: { 'x-app': 'bench' },
          adapter: 'fetch',
        })
        sink += typeof c.get === 'function' ? 1 : 0
      },
      bare: async () => {
        sink += 1
      },
    }),
  },
  'GET through 2 middleware/hooks': {
    note: 'composition machinery — pyreon middleware vs ky hooks vs ofetch interceptors vs axios interceptors. redaxios = n/a: it has no interceptor/hook layer at all, so it ran a PLAIN GET here — zero composition work, yet a printed ratio. bare = hand-inlined equivalent.',
    na: ['redaxios'],
    make: () => {
      const pyreonM = createHttp({
        baseUrl: BASE,
        timeout: false,
        use: [
          (req, next) => next({ ...req, meta: { ...req.meta, tagged: true } }),
          async (req, next) => {
            const res = await next(req)
            sink += res.status
            return res
          },
        ],
      })
      const kyM = ky.create({
        prefix: BASE,
        timeout: false,
        retry: 0,
        hooks: {
          beforeRequest: [() => undefined],
          // ky 2 unified every hook around a single state object; the old
          // (request, options, response) positional form is gone.
          afterResponse: [
            ({ response }) => {
              sink += response.status
              return response
            },
          ],
        },
      })
      const ofetchM = ofetch.create({
        baseURL: BASE,
        onRequest: () => undefined,
        onResponse: (ctx) => {
          sink += ctx.response.status
        },
      })
      const axiosM = axiosDefault.create({ baseURL: BASE, adapter: 'fetch' })
      axiosM.interceptors.request.use((cfg) => cfg)
      axiosM.interceptors.response.use((res) => {
        sink += res.status
        return res
      })
      return {
        pyreon: async () => {
          const d = (await pyreonM.get('users/1').json()) as { id: number }
          sink += d.id
        },
        ky: async () => {
          const d = (await kyM.get('users/1').json()) as { id: number }
          sink += d.id
        },
        ofetch: async () => {
          const d = await ofetchM<{ id: number }>('/users/1')
          sink += d.id
        },
        // Marked `na` above — redaxios has no interceptor layer. Throws so it
        // can never be silently re-enabled as a plain GET with a printed ratio.
        redaxios: async () => {
          throw new Error('n/a — redaxios has no request/response interceptors')
        },
        axios: async () => {
          const r = await axiosM.get<{ id: number }>('/users/1')
          sink += r.data.id
        },
        bare: async () => {
          const r = await fetch(`${BASE}/users/1`)
          sink += r.status
          const d = JSON.parse(await r.text()) as { id: number }
          sink += d.id
        },
      }
    },
  },
}
const OP_ORDER = Object.keys(OPS)

// ── child mode ────────────────────────────────────────────────────────────────
const childOp = process.argv[2]
const childImpl = process.argv[3] as ImplName | undefined
if (childOp) {
  const spec = OPS[childOp]
  if (!spec) throw new Error(`unknown op: ${childOp}`)
  if (!childImpl || !IMPLS.includes(childImpl)) throw new Error(`unknown impl: ${childImpl}`)
  // Defense in depth: the orchestrator already skips `na` cells. If one is ever
  // requested directly, fail loudly rather than measure a substitute call.
  if (spec.na?.includes(childImpl)) {
    throw new Error(`op "${childOp}" is n/a for ${childImpl} — it cannot express this feature`)
  }
  const impl = spec.make()
  const opts: Parameters<typeof measureSamplesAsync>[1] = {}
  if (spec.iters !== undefined) opts.iters = spec.iters
  const samples = await measureSamplesAsync(impl[childImpl], opts)
  process.stdout.write(JSON.stringify({ samples }))
  process.exit(0)
}

// ── orchestrator: correctness gate ────────────────────────────────────────────
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`[correctness] ${msg}`)
}
async function capture(fn: () => Promise<void>): Promise<Captured> {
  captured = null
  captureNext = true
  await fn()
  if (!captured) throw new Error('[correctness] stub fetch was not reached')
  return captured
}
{
  const c = makeClients()
  const expected = { id: 1, name: 'Ada', ok: true }
  const deep = (a: unknown) => JSON.stringify(a) === JSON.stringify(expected)

  assert(deep(await c.pyreon.get('users/1').json()), 'pyreon decodes body')
  assert(deep(await c.ky.get('users/1').json()), 'ky decodes body')
  assert(deep(await c.ofetch('/users/1')), 'ofetch decodes body')
  assert(deep((await c.redaxios.get('/users/1')).data), 'redaxios decodes body')
  assert(deep((await c.axios.get('/users/1')).data), 'axios decodes body')

  // axios MUST be on the fetch adapter (Node default is the http adapter,
  // which would bypass the stub and hit the network) — proven by capture:
  const ax = await capture(async () => {
    await c.axios.get('/users/1')
  })
  assert(ax.url.includes('/v1/users/1'), `axios routes through stub fetch (url=${ax.url})`)

  const payload = { name: 'Ada', role: 'admin' }
  const want = JSON.stringify(payload)
  for (const [name, fn] of [
    ['pyreon', async () => void (await c.pyreon.post('users', { json: payload }))],
    ['ky', async () => void (await c.ky.post('users', { json: payload }))],
    ['ofetch', async () => void (await c.ofetch('/users', { method: 'POST', body: payload }))],
    ['redaxios', async () => void (await c.redaxios.post('/users', payload))],
    ['axios', async () => void (await c.axios.post('/users', payload))],
  ] as const) {
    const got = await capture(fn)
    assert(got.method === 'POST', `${name} POST method`)
    assert(got.bodyText === want, `${name} POST body (got ${String(got.bodyText)})`)
    assert(
      (got.contentType ?? '').includes('application/json'),
      `${name} content-type (got ${String(got.contentType)})`,
    )
  }

  const q = { page: 2, q: 'ada', limit: 10 }
  const wantQs = 'page=2&q=ada&limit=10'
  for (const [name, fn] of [
    ['pyreon', async () => void (await c.pyreon.get('users', { query: q }))],
    ['ky', async () => void (await c.ky.get('users', { searchParams: q }))],
    ['ofetch', async () => void (await c.ofetch('/users', { query: q }))],
    ['redaxios', async () => void (await c.redaxios.get('/users', { params: q }))],
    ['axios', async () => void (await c.axios.get('/users', { params: q }))],
  ] as const) {
    const got = await capture(fn)
    const qs = got.url.split('?')[1] ?? ''
    assert(
      [...new URLSearchParams(qs).entries()].sort().join('&') ===
        [...new URLSearchParams(wantQs).entries()].sort().join('&'),
      `${name} query string (got ?${qs})`,
    )
  }

  console.log('✓ correctness gate passed — decode/POST/query agree across all libs\n')
}
if (process.env.BENCH_GATE_ONLY) process.exit(0)

interface Cell {
  med: number
  ci: [number, number]
}
interface Row {
  op: string
  /** `null` = the library cannot express this row's feature (see `OpSpec.na`). */
  cells: Record<ImplName, Cell | null>
  note?: string
}

const CELL_REPEATS = Number(process.env.BENCH_REPEATS ?? 3)

function runCell(op: string, impl: ImplName): Cell {
  const pooled: number[] = []
  for (let r = 0; r < CELL_REPEATS; r++) {
    const proc = Bun.spawnSync(['bun', import.meta.path, op, impl], {
      env: { ...process.env, NODE_ENV: 'production' },
    })
    if (proc.exitCode !== 0) throw new Error(`child failed for (op "${op}", impl "${impl}")`)
    const { samples } = JSON.parse(new TextDecoder().decode(proc.stdout)) as { samples: number[] }
    pooled.push(...samples)
  }
  return { med: median(pooled), ci: bootstrapCI(pooled) }
}

const rows: Row[] = []
for (const op of OP_ORDER) {
  const na = OPS[op]?.na ?? []
  const cells = {} as Record<ImplName, Cell | null>
  for (const impl of IMPLS) cells[impl] = na.includes(impl) ? null : runCell(op, impl)
  const row: Row = { op, cells }
  const note = OPS[op]?.note
  if (note !== undefined) row.note = note
  rows.push(row)
}

console.log(
  `=== @pyreon/http vs ky vs ofetch vs redaxios vs axios(fetch) + bare-fetch floor (${process.platform}/${process.arch}, NODE_ENV=production, stubbed fetch, per-(op×impl) isolated processes, median ns/op [CI95], 🤝 = CI-overlap tie vs pyreon) ===\n`,
)
const pad = (s: string, n: number) => s.padEnd(n)
const padL = (s: string, n: number) => s.padStart(n)
console.log(
  `${pad('op', 34)} ${padL('pyreon', 8)} ${padL('ky', 8)} ${padL('ofetch', 8)} ${padL('redaxios', 9)} ${padL('axios', 8)} ${padL('bare', 8)}   verdicts (competitor ÷ pyreon)`,
)
console.log('─'.repeat(150))
const num = (c: Cell | null, w: number) => padL(c === null ? 'n/a' : c.med.toFixed(0), w)
for (const r of rows) {
  const p = r.cells.pyreon
  if (p === null) throw new Error(`pyreon cannot be n/a (op "${r.op}")`)
  const verdict = (name: ImplName) => {
    const cell = r.cells[name]
    // A library that cannot express the feature gets `n/a`, never a ratio.
    if (cell === null) return `${name}=n/a`
    const ratio = cell.med / p.med
    const tie = overlaps(p.ci, cell.ci)
    const base = ratio >= 1 ? `${ratio.toFixed(2)}x` : `${ratio.toFixed(2)}x⚠`
    return `${name}=${tie ? `🤝${base}` : base}`
  }
  console.log(
    `${pad(r.op, 34)} ${padL(p.med.toFixed(0), 8)} ${num(r.cells.ky, 8)} ${num(r.cells.ofetch, 8)} ${num(r.cells.redaxios, 9)} ${num(r.cells.axios, 8)} ${num(r.cells.bare, 8)}   ${(['ky', 'ofetch', 'redaxios', 'axios'] as const).map(verdict).join(' ')}`,
  )
  if (r.note) console.log(`  └ ${r.note}`)
}
console.log(
  `\n(ratios = competitor ÷ pyreon; >1 ⇒ pyreon faster, ⚠ ⇒ pyreon slower; 🤝 = CI95 overlap (tie); n/a = the library cannot express that row's feature and is NOT measured — a missing feature is not a fast feature. bare = no-feature floor, not a competitor. Pooled median of 31 runs × ${CELL_REPEATS} fresh processes per cell; no forced GC; ns machine-dependent — ratios are the portable signal.)`,
)
