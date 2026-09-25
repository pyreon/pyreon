import { h, Suspense } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { renderToStream } from '../index'

async function collect(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader()
  let out = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    out += value
  }
  return out
}

async function Slow(): Promise<ReturnType<typeof h>> {
  await new Promise<void>((r) => setTimeout(r, 5))
  return h('p', null, 'done')
}

const tree = () =>
  h(Suspense, {
    fallback: h('p', null, 'loading'),
    children: h(Slow as unknown as ComponentFn, null),
  })

// Streaming emitted its inline scripts with no nonce, so a strict
// `script-src 'nonce-…'` policy blocked the Suspense swap and the page never
// showed the resolved content — pushing apps onto 'unsafe-inline'.
describe('renderToStream — CSP nonce', () => {
  it('puts the nonce on every inline script it emits', async () => {
    const html = await collect(renderToStream(tree(), { nonce: 'abc123' }))
    const scripts = html.match(/<script[^>]*>/g) ?? []
    expect(scripts.length).toBeGreaterThanOrEqual(2) // swap helper + swap call
    for (const tag of scripts) expect(tag).toContain('nonce="abc123"')
  })

  it('sanitizes the nonce so it cannot break out of the attribute', async () => {
    const html = await collect(renderToStream(tree(), { nonce: 'x" onload="evil' }))
    expect(html).not.toContain('onload="evil"')
  })

  it('emits no nonce attribute without one (byte-identical to before)', async () => {
    const html = await collect(renderToStream(tree()))
    expect(html).not.toContain('nonce=')
  })
})
