// @vitest-environment node
/**
 * Why `sheet.reset()` must NOT run at a server request boundary.
 *
 * `@pyreon/server`'s `createHandler` docs used to show
 * `collectStyles: (nonce) => { const tag = sheet.getStyleTag(nonce); sheet.reset(); return tag }`.
 * Request isolation is already automatic (`runWithRequestContext` opens a
 * per-request styler scope), and `reset()` also drops the definition-owned
 * rules nothing re-inserts: module-level `keyframes` and static
 * `createGlobalStyle` CSS are inserted ONCE, at module evaluation. After the
 * first request's reset, every later response shipped without them.
 *
 * The supported collector is the default one (omit `collectStyles`), or
 * `(nonce) => sheet.getStyleTag(nonce)`.
 */
import { h } from '@pyreon/core'
import { renderToString, runWithRequestContext } from '@pyreon/runtime-server'
import { createGlobalStyle } from '../globalStyle'
import { keyframes } from '../keyframes'
import { sheet } from '../sheet'
import { styled } from '../styled'

const fade = keyframes`from { opacity: 0; } to { opacity: 1; }`
const Base = createGlobalStyle`html { scroll-behavior: smooth; }`
const Box = styled('div')`
  color: teal;
  animation: ${String(fade)} 1s;
`

const request = (collect: (nonce?: string) => string): Promise<string> =>
  runWithRequestContext(async () => {
    await renderToString(h('main', null, h(Base, null), h(Box, null)))

    return collect(undefined)
  })

// The collector the docs now show (and what the default collector does).
const supported = (nonce?: string) => sheet.getStyleTag(nonce)

// The collector the docs used to show.
const withReset = (nonce?: string) => {
  const tag = sheet.getStyleTag(nonce)
  sheet.reset()

  return tag
}

describe('collectStyles at a request boundary', () => {
  it('the supported collector ships keyframes and global styles on EVERY request', async () => {
    for (let i = 0; i < 3; i++) {
      const tag = await request(supported)
      expect(tag).toContain('@keyframes')
      expect(tag).toContain('scroll-behavior: smooth')
      expect(tag).toContain('color: teal')
    }
  })

  // LAST in the file: it destroys the module-level rules for good, which is
  // exactly the point.
  it('reset() per request drops module-level keyframes and globals from every LATER response', async () => {
    const first = await request(withReset)
    expect(first).toContain('@keyframes')
    const second = await request(withReset)
    // The class rules come back (the render re-inserts them)...
    expect(second).toContain('color: teal')
    // ...but the definition-owned rules are gone for good.
    expect(second).not.toContain('@keyframes')
    expect(second).not.toContain('scroll-behavior: smooth')
  })
})
