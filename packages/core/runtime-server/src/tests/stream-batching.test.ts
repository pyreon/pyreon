/**
 * `renderToStream` batches output fragments (see `STREAM_FLUSH_BYTES`).
 * Contract: the CONCATENATED output is byte-identical to handing every
 * fragment over as produced, and everything rendered before a real wait is
 * delivered BEFORE that wait (the shell is not held back by a slow boundary).
 */
import { type ComponentFn, For, Suspense, h } from '@pyreon/core'
import { _setStreamFlushBytes, renderToStream } from '../index'

async function chunks(v: ReturnType<typeof h>): Promise<{ out: string[]; at: number[] }> {
  const t0 = Date.now()
  const r = renderToStream(v).getReader()
  const out: string[] = []
  const at: number[] = []
  for (;;) {
    const { value, done } = await r.read()
    if (done) return { out, at }
    out.push(value)
    at.push(Date.now() - t0)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function SlowAsync(p: { ms: number; label: string }) {
  await sleep(p.ms)
  return h('p', { class: 'slow' }, p.label)
}
// An async component is valid at runtime (SSR awaits it) but not a
// `ComponentFn` by type — the same cast the rest of this suite uses.
const Slow = SlowAsync as unknown as ComponentFn<{ ms: number; label: string }>

function page(n: number, ms: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i, t: `row <${i}> & "q"` }))
  return h(
    'div',
    { class: 'page' },
    h('h1', null, 'Title'),
    h(For, {
      each: rows,
      by: (r: { id: number }) => r.id,
      children: (r: { id: number; t: string }) => h('li', { 'data-id': r.id }, r.t),
    }),
    h(Suspense, { fallback: h('i', null, 'loading') }, h(Slow, { ms, label: 'A' })),
    h(Slow, { ms: 1, label: 'inline-async' }),
    h(Suspense, { fallback: h('i', null, 'loading2') }, h(Slow, { ms: ms * 2, label: 'B' })),
    h('footer', null, 'end'),
  )
}

describe('renderToStream — output batching', () => {
  afterEach(() => {
    _setStreamFlushBytes(4096)
  })

  for (const n of [0, 3, 50, 400]) {
    it(`concatenated output is byte-identical to unbatched (${n} rows)`, async () => {
      _setStreamFlushBytes(0)
      const plain = await chunks(page(n, 5))
      _setStreamFlushBytes(4096)
      const batched = await chunks(page(n, 5))
      expect(batched.out.join('')).toBe(plain.out.join(''))
      expect(batched.out.length).toBeLessThan(plain.out.length)
    })
  }

  it('delivers the shell and fallback before a slow boundary resolves', async () => {
    const { out } = await chunks(page(3, 60))
    const firstSlow = out.findIndex((c) => c.includes('>A<'))
    const before = out.slice(0, firstSlow).join('')
    expect(before).toContain('<h1>Title</h1>')
    expect(before).toContain('loading')
    expect(before).toContain('<footer>end</footer>')
  })

  it('delivers each swap as soon as its boundary resolves', async () => {
    const { out } = await chunks(page(3, 40))
    const a = out.findIndex((c) => c.includes('>A<'))
    const b = out.findIndex((c) => c.includes('>B<'))
    expect(a).toBeGreaterThan(-1)
    expect(b).toBeGreaterThan(a)
  })

  it('caps a chunk near the threshold on a large synchronous page', async () => {
    const { out } = await chunks(page(2000, 1))
    expect(out.length).toBeGreaterThan(5)
    for (const c of out.slice(0, -1)) expect(c.length).toBeLessThan(4096 + 512)
  })
})
