import { h } from '@pyreon/core'
import { renderToString } from '../index'

// Security sweep follow-up to #233/#235. `vnode.type` is interpolated
// into `<TAG>` and `</TAG>` unescaped (matching React/Vue/Solid — the
// framework trusts callers not to feed user-controlled strings as tag
// names). Defense-in-depth: dev-mode warning when the tag contains
// characters that would break HTML structure, so the mistake surfaces
// before it ships.

describe('SSR — dev warning for unsafe tag names', () => {
  let originalNodeEnv: string | undefined
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV
    // Ensure __DEV__ is true for the duration of these tests
    process.env.NODE_ENV = 'development'
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    warnSpy.mockRestore()
  })

  it('does not warn for a normal HTML tag', async () => {
    await renderToString(h('div', null, 'ok'))
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not warn for custom elements with hyphens', async () => {
    await renderToString(h('my-element', null, 'ok'))
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('warns when the tag contains > (HTML breakout attempt)', async () => {
    await renderToString(h('div><script>alert(1)</script><div', null, 'x'))
    expect(warnSpy).toHaveBeenCalled()
    const msg = warnSpy.mock.calls[0]?.[0] as string
    expect(msg).toContain('[Pyreon SSR]')
    expect(msg).toContain('break HTML structure')
  })

  it('warns when the tag contains a space (attribute-smuggling attempt)', async () => {
    await renderToString(h('div onerror=alert(1)', null, 'x'))
    expect(warnSpy).toHaveBeenCalled()
  })

  it('warns when the tag starts with a non-letter', async () => {
    await renderToString(h('123-bad', null, 'x'))
    expect(warnSpy).toHaveBeenCalled()
  })
})
