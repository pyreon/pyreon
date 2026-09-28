// @vitest-environment node
/**
 * `lazy()` inside `<Suspense>` through the COMPILED SSR path (`ssrTemplate`),
 * which renders the Suspense hole via `_ssrNode` / `StreamHole` rather than an
 * h() vnode. Both renderers must wait for the still-loading chunk there too,
 * and the output must stay byte-identical to the h() page.
 */
import { transformSync } from 'esbuild'
import { transformJSX_JS } from '@pyreon/compiler'
import type { ComponentFn } from '@pyreon/core'
import { Fragment, Suspense, _fuse, _rp, h, lazy } from '@pyreon/core'
import {
  _esc,
  _escSole,
  _ssr,
  _ssrDeferred,
  _ssrNode,
  renderToStream,
  renderToString,
} from '@pyreon/runtime-server'

const SRC = `
function Node(props) {
  return (
    <div class="page">
      <h1>Title</h1>
      <Suspense fallback={<p class="fb">loading</p>}>
        <Lazy who={props.who} />
      </Suspense>
      <footer>f</footer>
    </div>
  )
}
`

const Quote: ComponentFn<{ who: string }> = (p) => h('p', { class: 'q' }, `quote:${p.who}`)
const makeLazy = () =>
  lazy<{ who: string }>(() => new Promise((r) => setTimeout(() => r({ default: Quote }), 20)))

function compile(ssrTemplate: boolean, Lazy: unknown): (p: { who: string }) => unknown {
  const out = transformJSX_JS(SRC, 'page.tsx', { ssr: true, ssrTemplate })
  const lowered = transformSync(out.code.replace(/^import\s+.*$/gm, ''), {
    loader: 'jsx',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const names = ['h', 'Fragment', 'Suspense', '_rp', '_fuse', '_ssr', '_ssrNode', '_ssrDeferred', '_esc', '_escSole', 'Lazy']
  const vals = [h, Fragment, Suspense, _rp, _fuse, _ssr, _ssrNode, _ssrDeferred, _esc, _escSole, Lazy]
  // oxlint-disable-next-line no-new-func
  return new Function(...names, `${lowered}\nreturn Node`)(...vals)
}

async function read(stream: ReadableStream<string>): Promise<string> {
  const r = stream.getReader()
  let out = ''
  for (;;) {
    const { value, done } = await r.read()
    if (done) return out
    out += value
  }
}

describe('lazy() inside Suspense — compiled SSR path', () => {
  it('the emit takes the template path (premise)', () => {
    const { code } = transformJSX_JS(SRC, 'page.tsx', { ssr: true, ssrTemplate: true })
    expect(code).toContain('_ssrNode(')
  })

  for (const ssrTemplate of [true, false]) {
    it(`stream: the swap template carries the lazy content (ssrTemplate=${ssrTemplate})`, async () => {
      const Page = compile(ssrTemplate, makeLazy())
      const html = await read(renderToStream(h(Page as never, { who: 'c' })))
      expect(html).toContain('<p class="fb">loading</p>')
      expect(html).toMatch(/<template id="pyreon-t-0"><p class="q">quote:c<\/p><\/template>/)
    })

    it(`string: renders the lazy content, not the fallback (ssrTemplate=${ssrTemplate})`, async () => {
      const Page = compile(ssrTemplate, makeLazy())
      const html = await renderToString(h(Page as never, { who: 'd' }))
      expect(html).toContain('quote:d')
      expect(html).not.toContain('loading')
    })
  }

  it('compiled and h() pages produce byte-identical output', async () => {
    const compiled = await renderToString(h(compile(true, makeLazy()) as never, { who: 'e' }))
    const plain = await renderToString(h(compile(false, makeLazy()) as never, { who: 'e' }))
    expect(compiled).toBe(plain)
    const cs = await read(renderToStream(h(compile(true, makeLazy()) as never, { who: 'e' })))
    const ps = await read(renderToStream(h(compile(false, makeLazy()) as never, { who: 'e' })))
    expect(cs).toBe(ps)
  })
})
