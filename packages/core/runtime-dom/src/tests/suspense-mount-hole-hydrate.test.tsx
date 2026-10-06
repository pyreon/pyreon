/**
 * A `<Suspense>` hydrated as a TRAILING MOUNT HOLE of a compiled template —
 * the `examples/playground` /primitives shape, found by the playground e2e:
 *
 *   <div class="card"><h2>…</h2><button>…</button>
 *     <Suspense fallback={…}>{() => (show() ? <Lazy /> : <p>idle</p>)}</Suspense>
 *   </div>
 *
 * With `templatizeComponentChildren` (default-on in the vite plugin) the
 * `<Suspense>` is absorbed into `_mountChild(…)`, and `hydrateMountHole` hands
 * `hydrateChild` the hole's cursor as BOTH the node to hydrate AND the anchor.
 * The Suspense hydration branch delimits the range it claimed with a trailing
 * `/suspense` comment inserted before `next ?? anchor` — but a trailing hole
 * has no `next`, and the anchor (the accessor's `<!--$-->`) had just been
 * CONSUMED by the range adoption. `insertBefore` against a detached node threw
 * `NotFoundError`, the whole `SuspenseDemo` component failed to hydrate, and
 * its content vanished from the page.
 */
import { transformSync } from 'esbuild'
import { transformJSX } from '@pyreon/compiler'
import type { ComponentFn } from '@pyreon/core'
import { Fragment, Suspense, _fuse, _lc, h, lazy } from '@pyreon/core'
import { _bind, signal, renderEffect } from '@pyreon/reactivity'
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

const Quote: ComponentFn = () => h('p', { class: 'q' }, 'quote')
const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms))

function build(
  source: string,
  opts: Record<string, unknown>,
  Lazy: unknown,
  show: () => boolean,
): () => unknown {
  const { code } = transformJSX(source, 'app.tsx', opts)
  const body = transformSync(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const deps = {
    _tpl,
    _bind,
    renderEffect,
    _bindText,
    _bindDirect,
    _applyProps,
    _setAttr,
    _setClass,
    _mountSlot,
    _mountChild,
    _lc,
    _fuse,
    bindPolymorphicText,
    h,
    Fragment,
    Suspense,
    Lazy,
    show,
  }
  return new Function(...Object.keys(deps), `${body}\nreturn App`)(...Object.values(deps)) as () => unknown
}

const SOURCES = {
  'accessor child (playground shape)': `const App = () => <div class="card"><h2>T</h2><Suspense fallback={<i class="fb">l</i>}>{() => (show() ? <Lazy /> : <p class="idle">idle</p>)}</Suspense></div>`,
  'lazy child': `const App = () => <div class="card"><h2>T</h2><Suspense fallback={<i class="fb">l</i>}><Lazy /></Suspense></div>`,
}

describe('<Suspense> hydrated as a trailing mount hole', () => {
  beforeAll(() => disableHydrationWarnings())
  afterEach(() => {
    document.body.innerHTML = ''
  })

  for (const [name, src] of Object.entries(SOURCES)) {
    for (const templatize of [true, false]) {
      it(`${name} (templatizeComponentChildren=${templatize}): hydrates in place, no throw`, async () => {
        const opts = { templatizeComponentChildren: templatize }
        // Prove the arm under test is the one the name claims.
        expect(transformJSX(src, 'app.tsx', opts).code.includes('_mountChild(')).toBe(templatize)

        const isLazyChild = name === 'lazy child'
        const serverLazy = lazy(() => Promise.resolve({ default: Quote }))
        const html = await renderToString(
          h(build(src, { ssr: true }, serverLazy, () => false) as ComponentFn, null),
        )
        const c = document.createElement('div')
        document.body.appendChild(c)
        c.innerHTML = html
        const serverNode = c.querySelector(isLazyChild ? 'p.q' : 'p.idle')
        expect(serverNode).not.toBeNull()

        const errors: unknown[] = []
        const origError = console.error
        console.error = (...args: unknown[]) => {
          errors.push(args)
        }
        let land!: () => void
        const clientLazy = lazy(() => new Promise<{ default: ComponentFn }>((r) => (land = () => r({ default: Quote }))))
        const show = signal(false)
        try {
          hydrateRoot(c, h(build(src, opts, clientLazy, () => show()) as ComponentFn, null))
        } finally {
          console.error = origError
        }
        expect(errors).toEqual([])
        // The server node is ADOPTED, not dropped or rebuilt.
        expect(c.querySelector(isLazyChild ? 'p.q' : 'p.idle')).toBe(serverNode)
        expect(c.querySelector('h2')?.textContent).toBe('T')
        expect(c.querySelector('.fb')).toBeNull()

        if (!isLazyChild) {
          // Flip to the lazy: the boundary shows its fallback, then the content.
          show.set(true)
          expect(c.querySelector('p.idle')).toBeNull()
          expect(c.querySelector('.fb')).not.toBeNull()
        }
        land()
        await tick()
        expect(c.querySelectorAll('p.q').length).toBe(1)
        expect(c.querySelector('.fb')).toBeNull()
        if (isLazyChild) expect(c.querySelector('p.q')).toBe(serverNode)
      })
    }
  }
})
