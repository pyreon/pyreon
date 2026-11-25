// @vitest-environment happy-dom
/**
 * The shared theme effect (the one that keeps `<html data-theme>` following
 * `theme` / the OS preference) is created by the FIRST `<ThemeToggle>` to
 * mount, inside its `onMount`. It used to be OWNED by that toggle: when the
 * first toggle unmounted while others stayed mounted (the refcount still > 0),
 * the effect was disposed with it and `data-theme` stopped following changes.
 * The shared effect must belong to the refcount, not to whichever component
 * happened to start it.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetInitThemeForTests } from '../internal'
import { theme, ThemeToggle } from '../theme'

describe('zero/theme — the shared effect outlives the toggle that created it', () => {
  let container: HTMLElement
  let originalMatchMedia: typeof window.matchMedia | undefined

  beforeEach(() => {
    _resetInitThemeForTests()
    theme.set('light')
    container = document.createElement('div')
    document.body.appendChild(container)
    originalMatchMedia = window.matchMedia
    window.matchMedia = (() => ({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    _resetInitThemeForTests()
    container.remove()
    if (originalMatchMedia) window.matchMedia = originalMatchMedia
  })

  it('data-theme keeps following `theme` after the FIRST toggle unmounts', () => {
    const showFirst = signal(true)
    const unmount = mount(
      h('div', null, () => (showFirst() ? h(ThemeToggle, null) : null), h(ThemeToggle, null)),
      container,
    )
    expect(document.documentElement.dataset.theme).toBe('light')
    showFirst.set(false)
    theme.set('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    unmount()
  })

  it('the effect stops once the LAST toggle unmounts', () => {
    const unmount = mount(h('div', null, h(ThemeToggle, null)), container)
    unmount()
    document.documentElement.dataset.theme = 'light'
    theme.set('dark')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
