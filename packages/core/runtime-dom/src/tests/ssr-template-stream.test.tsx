// @vitest-environment node
/**
 * Compiled (`ssrTemplate`) pages must STREAM Suspense like h() pages do.
 *
 * The compiler lowers `<div>…<Suspense>…</Suspense>…</div>` to one
 * `_ssrDeferred(() => _ssr([...], _ssrNode(<Suspense …/>)))` call. `_ssrNode`
 * rendered its node with the STRING renderer, which awaits the slow child and
 * emits no fallback — so under `renderToStream` the default compiler output
 * arrived as a single chunk after the slowest child, while the identical h()
 * page flushed its shell + fallback immediately.
 *
 * Asserted here against the real JS compiler emit (the Rust backend's `_ssr`
 * emit is byte-locked to it by the compiler's ssr-template-emit test):
 *   - the shell AND the fallback arrive before the slow child's content;
 *   - the concatenated stream is byte-identical to the h() page's stream.
 */
import { transformSync } from 'esbuild'
import { transformJSX_JS } from '@pyreon/compiler'
import { Fragment, Suspense, _fuse, _rp, h } from '@pyreon/core'
import { _esc, _escSole, _ssr, _ssrDeferred, _ssrNode, renderToStream, renderToString } from '@pyreon/runtime-server'

const SRC = `
async function Slow(props) {
  await new Promise((r) => setTimeout(r, props.ms))
  return <p class="slow">loaded after {props.ms}ms</p>
}
function Node(props) {
  return (
    <div class="page">
      <h1>Title</h1>
      <Suspense fallback={<p class="fb">loading</p>}>
        <Slow ms={props.ms} />
      </Suspense>
      <footer><p>footer</p></footer>
    </div>
  )
}
`

function compile(ssrTemplate: boolean): (p: { ms: number }) => unknown {
  const out = transformJSX_JS(SRC, 'page.tsx', { ssr: true, ssrTemplate })
  const lowered = transformSync(out.code.replace(/^import\s+.*$/gm, ''), {
    loader: 'jsx',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const names = ['h', 'Fragment', 'Suspense', '_rp', '_fuse', '_ssr', '_ssrNode', '_ssrDeferred', '_esc', '_escSole']
  const vals = [h, Fragment, Suspense, _rp, _fuse, _ssr, _ssrNode, _ssrDeferred, _esc, _escSole]
  // oxlint-disable-next-line no-new-func
  return new Function(...names, `${lowered}\nreturn Node`)(...vals)
}

async function readChunks(stream: ReadableStream<string>): Promise<string[]> {
  const r = stream.getReader()
  const out: string[] = []
  for (;;) {
    const { value, done } = await r.read()
    if (done) return out
    out.push(value)
  }
}

describe('compiled SSR templates stream Suspense', () => {
  it('the emit takes the template path (premise)', () => {
    const { code } = transformJSX_JS(SRC, 'page.tsx', { ssr: true, ssrTemplate: true })
    expect(code).toContain('_ssrNode(')
  })

  it('flushes shell + fallback before the slow child resolves', async () => {
    const Page = compile(true)
    const chunks = await readChunks(renderToStream(h(Page as never, { ms: 30 })))
    const slowAt = chunks.findIndex((c) => c.includes('loaded after'))
    const fbAt = chunks.findIndex((c) => c.includes('class="fb"'))
    expect(fbAt).toBeGreaterThanOrEqual(0)
    expect(slowAt).toBeGreaterThan(fbAt)
    // The shell (title) has been delivered in a chunk before the slow content.
    expect(chunks.slice(0, slowAt).join('')).toContain('<h1>Title</h1>')
  })

  it('the concatenated stream is byte-identical to the h() page', async () => {
    const tpl = (await readChunks(renderToStream(h(compile(true) as never, { ms: 5 })))).join('')
    const plain = (await readChunks(renderToStream(h(compile(false) as never, { ms: 5 })))).join('')
    expect(tpl).toBe(plain)
  })

  it('string mode is unchanged (byte-identical to h())', async () => {
    const a = await renderToString(h(compile(true) as never, { ms: 1 }))
    const b = await renderToString(h(compile(false) as never, { ms: 1 }))
    expect(a).toBe(b)
  })
})
