// @vitest-environment node
/**
 * String-mode SSR CSS isolation, end to end through the real renderer.
 *
 * The styler `sheet` is a process singleton. Before request scoping reached
 * string mode, its SSR buffer was never reset, so a page's `<style>` carried
 * every rule any EARLIER page had inserted (measured on the ssr-showcase:
 * `/posts/1` was 2850 B, and 12,710 B after one `/sections` request), and an
 * SSG page's CSS depended on the order pages were prerendered in.
 *
 * `runWithRequestContext` now opens a styler scope, and every render site that
 * hands out a CACHED class marks it used (`sheet.markUsed`), so a request's
 * `<style>` is exactly: ambient rules (module-level keyframes / static globals)
 * + the rules its own render touched.
 */
import { h } from '@pyreon/core'
import { renderToString, runWithRequestContext } from '@pyreon/runtime-server'
import { createGlobalStyle } from '../globalStyle'
import { keyframes } from '../keyframes'
import { sheet } from '../sheet'
import { styled } from '../styled'

// Module-level, exactly like app code: inserted ONCE, at evaluation.
const spin = keyframes`from { opacity: 0; } to { opacity: 1; }`
const Reset = createGlobalStyle`body { margin: 0; }`
const Red = styled('div')`color: red;`
const Blue = styled('div')`color: blue;`
const Dyn = styled('span')`
  color: ${(p: { c: string }) => p.c};
  animation: ${spin} 1s;
`

async function page(children: () => unknown): Promise<string> {
  return runWithRequestContext(async () => {
    await renderToString(h('main', null, h(Reset, null), children() as never))
    return sheet.getStyleTag()
  })
}

const pageA = () => page(() => [h(Red, null), h(Dyn, { c: 'green' })])
const pageB = () => page(() => h(Blue, null))

describe('styler — string-mode SSR request isolation', () => {
  it('a page does not carry rules another request inserted', async () => {
    await pageA()
    const b = await pageB()
    expect(b).toContain('color: blue')
    expect(b).not.toContain('color: red')
    expect(b).not.toContain('color: green')
  })

  it('a cached (already-inserted) class still reaches a later request', async () => {
    await pageA()
    const again = await pageA()
    expect(again).toContain('color: red')
    expect(again).toContain('color: green')
  })

  it('module-level keyframes and static globals reach EVERY request', async () => {
    const b = await pageB()
    expect(b).toContain('@keyframes')
    expect(b).toContain('margin: 0')
  })

  it('page CSS is independent of render order', async () => {
    const a1 = await pageA()
    const b1 = await pageB()
    const b2 = await pageB()
    const a2 = await pageA()
    expect(b2).toBe(b1)
    expect(a2).toBe(a1)
  })

  it('a module evaluated DURING a request does not push rules it only defines', async () => {
    // A lazy route module evaluates inside the first request that needs it;
    // defining a styled component there is not rendering it.
    const tag = await runWithRequestContext(async () => {
      styled('p')`color: purple;`
      await renderToString(h(Blue, null))
      return sheet.getStyleTag()
    })
    expect(tag).toContain('color: blue')
    expect(tag).not.toContain('color: purple')
  })

  it('concurrent requests do not see each other', async () => {
    const [a, b] = await Promise.all([pageA(), pageB()])
    expect(a).not.toContain('color: blue')
    expect(b).not.toContain('color: red')
  })
})
