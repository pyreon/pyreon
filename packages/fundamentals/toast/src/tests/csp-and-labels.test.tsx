/** @jsxImportSource @pyreon/core */
// #4825 — the injected `<style>` can carry a CSP nonce or be turned off (with
// the same rules shipped as `@pyreon/toast/styles.css`).
// #4826 — the region and dismiss-button names are props, not fixed English.
// The CSP refusal itself is a browser behaviour, locked in
// `csp.browser.test.tsx`; these lock the DOM contract in happy-dom.
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { toastStyles } from '../styles'
import { _reset, toast } from '../toast'
import { Toaster } from '../toaster'
import type { ToasterProps } from '../types'

const ROOT = join(import.meta.dirname, '..', '..')

let host: HTMLDivElement
let dispose: (() => void) | undefined

const mountToaster = (props: ToasterProps): void => {
  host = document.createElement('div')
  document.body.appendChild(host)
  dispose = mount(h(Toaster, { ...props }), host)
}

beforeEach(() => {
  _reset()
  document.head.querySelector('style[data-pyreon-toast]')?.remove()
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  host.remove()
  _reset()
})

const styleEl = () => document.head.querySelector<HTMLStyleElement>('style[data-pyreon-toast]')
const region = () => document.querySelector('.pyreon-toast-container')
const dismissButtons = () => [...document.querySelectorAll('.pyreon-toast__dismiss')]

describe('style injection (#4825)', () => {
  it('injects the stylesheet by default, without a nonce', () => {
    mountToaster({})
    expect(styleEl()?.textContent).toBe(toastStyles)
    expect(styleEl()?.hasAttribute('nonce')).toBe(false)
  })

  it('`nonce` is set on the injected <style>', () => {
    mountToaster({ nonce: 'r4nd0m' })
    expect(styleEl()?.getAttribute('nonce')).toBe('r4nd0m')
  })

  it('`injectStyles={false}` injects nothing', () => {
    mountToaster({ injectStyles: false, nonce: 'ignored' })
    expect(styleEl()).toBeNull()
    // The Toaster still renders.
    expect(region()).not.toBeNull()
  })

  it('`@pyreon/toast/styles.css` carries exactly the rules the Toaster injects', () => {
    const file = readFileSync(join(ROOT, 'styles.css'), 'utf8')
    expect(file).toBe(`${toastStyles.trim()}\n`)
  })

  it('package.json exports ./styles.css and publishes it', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>
      files: string[]
      sideEffects: unknown
    }
    expect(pkg.exports['./styles.css']).toBe('./styles.css')
    expect(pkg.files).toContain('styles.css')
    // A bundler must not drop a bare `import '@pyreon/toast/styles.css'`.
    expect(pkg.sideEffects).toEqual(['**/*.css'])
  })
})

describe('accessible names (#4826)', () => {
  it('default to "Notifications" / "Dismiss"', () => {
    mountToaster({})
    toast('x', { duration: 0 })
    expect(region()?.getAttribute('aria-label')).toBe('Notifications')
    expect(dismissButtons()[0]?.getAttribute('aria-label')).toBe('Dismiss')
  })

  it('`label` / `dismissLabel` strings replace them', () => {
    mountToaster({ label: 'Oznámení', dismissLabel: 'Zavřít' })
    toast('x', { duration: 0 })
    expect(region()?.getAttribute('aria-label')).toBe('Oznámení')
    expect(dismissButtons()[0]?.getAttribute('aria-label')).toBe('Zavřít')
  })

  it('accessors follow a locale signal, relabelling open toasts in place', () => {
    const locale = signal<'en' | 'cs'>('en')
    mountToaster({
      label: () => (locale() === 'cs' ? 'Oznámení' : 'Notifications'),
      dismissLabel: () => (locale() === 'cs' ? 'Zavřít' : 'Close'),
    })
    toast('x', { duration: 0 })
    const btn = dismissButtons()[0]
    expect(btn?.getAttribute('aria-label')).toBe('Close')
    locale.set('cs')
    expect(region()?.getAttribute('aria-label')).toBe('Oznámení')
    // Same element — relabelled, not remounted.
    expect(dismissButtons()[0]).toBe(btn)
    expect(btn?.getAttribute('aria-label')).toBe('Zavřít')
  })

  it("a toast's own `dismissLabel` wins over the Toaster's", () => {
    mountToaster({ dismissLabel: 'Zavřít' })
    toast('a', { duration: 0, dismissLabel: 'Skrýt chybu' })
    toast('b', { duration: 0 })
    const labels = dismissButtons().map((b) => b.getAttribute('aria-label'))
    expect(labels).toEqual(['Skrýt chybu', 'Zavřít'])
  })
})
