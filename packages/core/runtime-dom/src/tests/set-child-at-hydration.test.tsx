import * as CORE from '@pyreon/core'
import { h } from '@pyreon/core'
import { transformJSX } from '@pyreon/compiler'
import * as REACT from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { describe, expect, it, vi } from 'vitest'

import * as RT from '../index'
import { hydrateRoot, mount } from '../index'

const RUNTIME_DEPS: Record<string, unknown> = { ...RT, ...CORE, ...REACT }
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)
const lowerResidualJsx = (code: string) =>
  transformSync(code, { loader: 'jsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' })
    .code
function compileApp(source: string, S: unknown[], ssr = false): () => unknown {
  const { code } = transformJSX(source, 'test.tsx', (ssr ? { ssr: true } : {}) as never)
  const body = lowerResidualJsx(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''))
  return new Function(...DEP_NAMES, 'S', `${body}\nreturn App`)(...DEP_VALUES, S) as () => unknown
}
const strip = (s: string) => s.replace(/<!--[^>]*-->/g, '')

/**
 * Hydrate the SSR output and, separately, mount the same source fresh. The
 * fresh mount is the oracle: whatever hydration produces must match it.
 */
async function parity(src: string, mk: () => unknown[]) {
  const html = await (renderToString(
    h(compileApp(src, mk(), true) as never, null) as never,
  ) as unknown as Promise<string>)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  hydrateRoot(host, h(compileApp(src, mk()) as never, null))

  const ref = document.createElement('div')
  document.body.appendChild(ref)
  mount(h(compileApp(src, mk()) as never, null) as never, ref)
  return { ssr: strip(html), hydrated: strip(host.innerHTML), fresh: strip(ref.innerHTML), errors }
}

const rows = () => [[h('b', null, 'a'), h('i', null, 'b')]]

/**
 * `_setChildAt` had no hydration path, while the adoption verifier relaxes the
 * element it writes into.
 *
 * The verifier reads an element whose TEMPLATE has a `<!>` as its only child as
 * a sole slot whose SSR markers were elided, and then skips verifying that
 * element's children. But the compiler routes two shapes to `_setChildAt`
 * rather than `_mountSlot` — a fragment wrapper and a dropped nothing-rendering
 * sibling — because `classifyJsxChild` recurses fragments and drops `{null}`
 * while `ssrSoleChild` counts both. Both produce a `<!>` at firstChild with the
 * slot NOT sole to SSR.
 *
 * When the value is STATIC, SSR emits no markers either way, so the verifier's
 * marker re-check cannot separate "sole, elided" from "static, never
 * applicable" — and it adopts. `_setChildAt` then mounted a fresh copy beside
 * the server's nodes and removed exactly one of them:
 *
 *   ssr       <div class="w"><b>a</b><i>b</i></div>
 *   hydrated  <div class="w"><b>a</b><i>b</i><i>b</i></div>
 *   fresh     <div class="w"><b>a</b><i>b</i></div>
 *
 * This is the catalogued shape: a verifier relaxation needs a hydrate-mode
 * counterpart to whatever mount call fills the range, or it duplicates the page.
 */
describe('_setChildAt adopts instead of re-mounting when the element was adopted', () => {
  for (const [label, src] of [
    ['a fragment wrapper', `const App = () => <main><div class="w"><>{S[0]}</></div></main>`],
    ['a dropped {null} sibling', `const App = () => <main><div class="w">{null}{S[0]}</div></main>`],
  ] as Array<[string, string]>) {
    it(`${label} hydrates without duplicating`, async () => {
      const r = await parity(src, rows)
      expect(r.hydrated, `${label}: hydrated must equal a fresh client mount`).toBe(r.fresh)
      expect(r.hydrated).toBe('<main><div class="w"><b>a</b><i>b</i></div></main>')
      expect(r.errors, 'no hydration mismatch warning').not.toHaveBeenCalled()
    })
  }

  it('the genuinely-sole shape is unaffected', async () => {
    const r = await parity(`const App = () => <main><div class="w">{S[0]}</div></main>`, rows)
    expect(r.hydrated).toBe(r.fresh)
  })

  // Found while fixing the above: the fresh mount rendered the literal word
  // "null". `String(null)` is `"null"`, and the non-mountable branch handed that
  // straight to `createTextNode` — while `_setChild` (`textContent = value`,
  // which the DOM coerces) and SSR (`renderNode(null)` -> `''`) both render
  // nothing. A client/server text divergence sitting beside its correct sibling.
  it('a nullish value renders EMPTY, not the text "null"', async () => {
    const r = await parity(`const App = () => <main><div class="w"><>{S[0]}</></div></main>`, () => [
      null,
    ])
    expect(r.fresh, 'the fresh mount must not print the word null').toBe(
      '<main><div class="w"></div></main>',
    )
    expect(r.ssr, 'and SSR already rendered nothing').toBe('<main><div class="w"></div></main>')
    expect(r.hydrated).toBe(r.fresh)
  })
})
