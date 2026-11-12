/**
 * #4439: server-rendered camelCase SVG elements hydrate in place. The real
 * proof is the Chromium twin `hydrate-svg-camelcase.browser.test.tsx`; this
 * file pins that its literal server HTML and compiled template are what
 * `renderToString` and `transformJSX` really emit, and runs the compiled
 * client against the compiled SSR output (both through the real compiler).
 */
import { transformJSX } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import { transformSync } from 'esbuild'
import * as reactivity from '@pyreon/reactivity'
import * as runtimeServer from '@pyreon/runtime-server'
import * as runtimeDom from '../index'
import {
  CAMEL_SVG_SSR,
  CAMEL_SVG_TAGS,
  camelSvgRows,
  camelSvgTree,
  SVG_ROWS_DATA,
  SVG_ROWS_SSR,
} from './_svg-camelcase-cases'

const COMPILED_SRC = `export const App = () => (
  <svg viewBox="0 0 20 20">
    <defs>
      <linearGradient id="g" gradientTransform={t()}><stop offset="0" stop-color="red" /></linearGradient>
      <clipPath id="c"><rect width="10" height="10" /></clipPath>
    </defs>
  </svg>
)`

/**
 * Compile `src` through the real compiler (client or SSR emit) and evaluate it.
 * Imports are resolved against the real modules by name; `t` is the signal the
 * source reads.
 */
function compile(src: string, ssr: boolean, t: () => string): () => unknown {
  const { code } = transformJSX(src, 'svg.tsx', (ssr ? { ssr: true } : {}) as never)
  const modules: Record<string, Record<string, unknown>> = {
    '@pyreon/core': core,
    '@pyreon/reactivity': reactivity,
    '@pyreon/runtime-dom': runtimeDom,
    '@pyreon/runtime-server': runtimeServer,
  }
  const scope: Record<string, unknown> = { t }
  for (const m of code.matchAll(/^import \{([^}]*)\} from "([^"]+)";?$/gm)) {
    const mod = modules[m[2]!]
    if (!mod) throw new Error(`[test] compiled code imports an unmapped module ${m[2]}`)
    for (const name of m[1]!
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean))
      scope[name] = mod[name]
  }
  // The SSR emit leaves JSX for the h() fallback; lower it the way a bundler does.
  const lowered = transformSync(code.replace(/^import[^\n]*\n/gm, ''), {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  scope.h = core.h
  scope.Fragment = core.Fragment
  const body = lowered.replace(/^export\s+/gm, '')
  const keys = Object.keys(scope)
  return new Function(...keys, `${body}\nreturn App`)(...keys.map((k) => scope[k])) as () => unknown
}

const { h } = core
const { signal } = reactivity
const { renderToString } = runtimeServer
const { hydrateRoot, onHydrationMismatch } = runtimeDom

describe('camelCase SVG hydration — emitted shapes', () => {
  it('renderToString emits the literal server HTML the browser spec hydrates', async () => {
    expect(await renderToString(camelSvgTree(() => {}))).toBe(CAMEL_SVG_SSR)
    expect(
      await renderToString(
        camelSvgRows(
          () => SVG_ROWS_DATA,
          () => {},
        ),
      ),
    ).toBe(SVG_ROWS_SSR)
  })

  it('transformJSX emits the literal template the browser spec adopts', () => {
    const { code } = transformJSX(COMPILED_SRC.replace(/\n\s*/g, ''), 'svg.tsx')
    expect(code).toContain(
      '_tpl("<svg viewBox=\\"0 0 20 20\\"><defs><linearGradient id=\\"g\\"><stop offset=\\"0\\" stop-color=\\"red\\"></stop></linearGradient><clipPath id=\\"c\\"><rect width=\\"10\\" height=\\"10\\"></rect></clipPath></defs></svg>"',
    )
    expect(code).toContain('_bindDirect(t, (v) => _setAttr(__e0, "gradientTransform", v))')
  })
})

describe('camelCase SVG hydration — happy-dom', () => {
  let stop: (() => void) | null = null
  afterEach(() => {
    stop?.()
    stop = null
    document.body.innerHTML = ''
  })
  const mismatches = (): string[] => {
    const seen: string[] = []
    stop = onHydrationMismatch((ctx) =>
      seen.push(`${ctx.type}: ${String(ctx.expected)} vs ${String(ctx.actual)}`),
    )
    return seen
  }

  it('h() path: every camelCase SVG element is adopted', async () => {
    const host = document.createElement('div')
    host.innerHTML = await renderToString(camelSvgTree(() => {}))
    document.body.appendChild(host)
    const before = CAMEL_SVG_TAGS.map((tag) => host.querySelector(`[id="x-${tag}"]`))
    const seen = mismatches()
    const dispose = hydrateRoot(
      host,
      camelSvgTree(() => {}),
    )
    expect(seen).toEqual([])
    expect(CAMEL_SVG_TAGS.map((tag) => host.querySelector(`[id="x-${tag}"]`))).toEqual(before)
    dispose()
  })

  it('compiled path: the compiled client adopts the compiled SSR output', async () => {
    const t = signal('rotate(1)')
    const ServerApp = compile(COMPILED_SRC, true, t)
    const ClientApp = compile(COMPILED_SRC, false, t)
    const host = document.createElement('div')
    host.innerHTML = await renderToString(h(ServerApp as never, null))
    document.body.appendChild(host)
    const grad = host.querySelector('linearGradient')
    expect(grad).not.toBeNull()
    const seen = mismatches()
    const dispose = hydrateRoot(host, h(ClientApp as never, null))
    expect(seen).toEqual([])
    expect(host.querySelector('linearGradient')).toBe(grad)
    t.set('rotate(2)')
    expect(grad?.getAttribute('gradientTransform')).toBe('rotate(2)')
    dispose()
  })
})
