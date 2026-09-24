// The client half of the system mode: the OS preference, a live media-query
// subscription, and the page-declared `color-scheme` winning over the OS. Core
// runs in Node, so the browser globals are stubbed BEFORE the first import —
// vitest isolates each file, so `isClient` is evaluated against the stubs.
let osDark = true
let mediaHandler: ((e: { matches: boolean }) => void) | null = null
let pageScheme = ''
let observed: (() => void) | null = null

const g = globalThis as Record<string, unknown>
g.window = {
  matchMedia: () => ({
    get matches() {
      return osDark
    },
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => {
      mediaHandler = fn
    },
  }),
}
g.document = { documentElement: {} }
g.getComputedStyle = () => ({ colorScheme: pageScheme })
g.MutationObserver = class {
  constructor(cb: () => void) {
    observed = cb
  }
  observe(): void {}
}

const { systemColorMode, useColorMode } = await import('../color-mode')

describe('system color mode, client side', () => {
  test('follows the OS preference, live', () => {
    const mode = systemColorMode()
    expect(mode()).toBe('dark')
    expect(mediaHandler, 'the media query must be subscribed, not sampled once').not.toBeNull()
    osDark = false
    mediaHandler!({ matches: false })
    expect(mode()).toBe('light')
    osDark = true
    mediaHandler!({ matches: true })
    expect(mode()).toBe('dark')
  })

  test('a page-declared scheme wins over the OS, and a toggle is observed', () => {
    const mode = systemColorMode()
    osDark = true
    pageScheme = 'only light'
    observed!()
    expect(mode()).toBe('light')
    pageScheme = 'dark'
    observed!()
    expect(mode()).toBe('dark')
    // `light dark` names no single scheme, so the OS decides.
    osDark = false
    mediaHandler!({ matches: false })
    pageScheme = 'light dark'
    observed!()
    expect(mode()).toBe('light')
  })

  test('the accessor is one shared instance, and the unprovided default reads it', () => {
    expect(systemColorMode()).toBe(systemColorMode())
    expect(useColorMode()()).toBe(systemColorMode()())
  })
})
