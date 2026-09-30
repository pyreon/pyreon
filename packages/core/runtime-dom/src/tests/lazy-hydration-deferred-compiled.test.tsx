/**
 * Deferred lazy hydration through the REAL compiler's client emit — the shape
 * a Vite app ships, not the h() shape the sibling spec file uses. A component
 * child of a templated element is absorbed into a mount hole
 * (`templatizeComponentChildren`, default-on in the vite plugin) or lowered to
 * `h()`; both must reach the deferral and keep the server range.
 */
import { transformSync } from 'esbuild'
import { transformJSX } from '@pyreon/compiler'
import type { ComponentFn } from '@pyreon/core'
import { Fragment, Suspense, _fuse, _lc, h, lazy } from '@pyreon/core'
import { _bind } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import {
  _applyProps,
  _bindDirect,
  _bindText,
  _mountChild,
  _mountSlot,
  _setAttr,
  _setClass,
  _tpl,
  disableHydrationWarnings,
  hydrateRoot,
} from '../index'
import { bindPolymorphicText } from '../mount'

const Quote: ComponentFn<{ who: string }> = (p) => h('p', { class: 'q' }, `quote:${p.who}`)
const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms))

function build(source: string, opts: Record<string, unknown>, Lazy: unknown): () => unknown {
  const { code } = transformJSX(source, 'app.tsx', opts)
  const body = transformSync(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const deps = { _tpl, _bind, _bindText, _bindDirect, _applyProps, _setAttr, _setClass, _mountSlot, _mountChild, _lc, _fuse, bindPolymorphicText, h, Fragment, Suspense, Lazy }
  return new Function(...Object.keys(deps), `${body}\nreturn App`)(...Object.values(deps)) as () => unknown
}

const SOURCES = {
  'mount hole': `const App = () => <div class="app"><h1>T</h1><Lazy who="a" /></div>`,
  'suspense child': `const App = () => <div class="app"><Suspense fallback={<i class="fb">l</i>}><Lazy who="a" /></Suspense><b>after</b></div>`,
}

describe('deferred lazy hydration — compiled client emit', () => {
  beforeAll(() => disableHydrationWarnings())
  afterEach(() => {
    document.body.innerHTML = ''
  })

  for (const [name, src] of Object.entries(SOURCES)) {
    for (const templatize of [true, false]) {
      it(`${name} (templatizeComponentChildren=${templatize}): the server node is kept and adopted`, async () => {
        const opts = { templatizeComponentChildren: templatize }
        // Prove the arm under test is the one the name claims.
        const emitted = transformJSX(src, 'app.tsx', opts).code
        if (name === 'mount hole') expect(emitted.includes('_mountChild(')).toBe(templatize)
        // The server renders the same source through the SSR emit's h() path
        // (byte-identical to the `ssrTemplate` emit —
        // `ssr-template-differential.test.tsx`).
        const serverLazy = lazy<{ who: string }>(() => Promise.resolve({ default: Quote }))
        const ServerApp = build(src, { ssr: true }, serverLazy)
        const html = await renderToString(h(ServerApp as ComponentFn, null))
        expect(html).toContain('quote:a')

        const c = document.createElement('div')
        document.body.appendChild(c)
        c.innerHTML = html
        const serverP = c.querySelector('p.q')

        let land!: () => void
        const clientLazy = lazy<{ who: string }>(
          () => new Promise((r) => (land = () => r({ default: Quote }))),
        )
        hydrateRoot(c, h(build(src, opts, clientLazy) as ComponentFn, null))
        expect(c.querySelector('p.q')).toBe(serverP)
        expect(c.querySelector('.fb')).toBeNull()
        land()
        await tick()
        expect(c.querySelector('p.q')).toBe(serverP)
        expect(c.querySelectorAll('p.q').length).toBe(1)
      })
    }
  }
})
