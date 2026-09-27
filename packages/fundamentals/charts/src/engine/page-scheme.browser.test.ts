// Charts follow the PAGE's declared scheme (CSS `color-scheme` on <html>), not
// only the OS. Found in the docs gallery: the site is dark by default with its
// own toggle, the OS was light, and every chart painted light on a dark page.
// Real Chromium: happy-dom does not compute `color-scheme`.
import { afterEach, describe, expect, it } from 'vitest'
import { systemColorMode } from '@pyreon/core'

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('systemColorMode (@pyreon/core) reads the page-declared color-scheme', () => {
  afterEach(async () => {
    document.documentElement.style.colorScheme = ''
    await settle()
  })

  it('a page declaring dark is dark, whatever the OS says', async () => {
    const mode = systemColorMode()
    document.documentElement.style.colorScheme = 'dark'
    await settle()
    expect(mode()).toBe('dark')
  })

  it('a toggle to light follows, live', async () => {
    const mode = systemColorMode()
    document.documentElement.style.colorScheme = 'dark'
    await settle()
    document.documentElement.style.colorScheme = 'light'
    await settle()
    expect(mode()).toBe('light')
  })

  it('an undecided page (`light dark`) falls back to the OS preference', async () => {
    const mode = systemColorMode()
    document.documentElement.style.colorScheme = 'light dark'
    await settle()
    expect(mode()).toBe(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  })
})
