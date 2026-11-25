/**
 * #4825 — `<Toaster>` under a strict Content Security Policy, in real Chromium.
 *
 * The page carries `style-src 'self' 'nonce-…'` (no `'unsafe-inline'`), set
 * through a `<meta http-equiv>` before anything below mounts. A CSP cannot be
 * lifted once applied, so this file runs entirely under it, in its own frame.
 *
 *   1. the default injection IS refused (a `securitypolicyviolation` fires and
 *      the container gets no `position: fixed`) — proves the harness detects
 *      the bug, so the two passing cases below are not vacuous;
 *   2. `nonce` — the injected `<style>` is accepted and applies;
 *   3. `injectStyles={false}` + `@pyreon/toast/styles.css` as a `<link>` — no
 *      violation, and the same rules apply from the file.
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { _reset, toast } from '../toast'
import { Toaster } from '../toaster'
import type { ToasterProps } from '../types'

const NONCE = 'pyreon-toast-csp-test'

const violations: SecurityPolicyViolationEvent[] = []

beforeAll(() => {
  const meta = document.createElement('meta')
  meta.httpEquiv = 'Content-Security-Policy'
  meta.content = `style-src 'self' 'nonce-${NONCE}'`
  document.head.appendChild(meta)
  document.addEventListener('securitypolicyviolation', (e) => violations.push(e))
})

let host: HTMLDivElement | undefined
let dispose: (() => void) | undefined

afterEach(() => {
  dispose?.()
  host?.remove()
  for (const el of document.head.querySelectorAll('style[data-pyreon-toast], link[data-test-toast-css]')) el.remove()
  _reset()
  violations.length = 0
})

const settle = () => new Promise<void>((r) => setTimeout(r, 100))

async function mountToaster(props: ToasterProps): Promise<HTMLElement> {
  violations.length = 0
  host = document.createElement('div')
  document.body.appendChild(host)
  dispose = mount(h(Toaster, { ...props }), host)
  toast('Saved', { duration: 0 })
  await settle()

  return document.querySelector('.pyreon-toast-container') as HTMLElement
}

/** Violations of the stylesheet rule (a `<style>` element), not of anything else. */
const styleElementViolations = () =>
  violations.filter((v) => v.effectiveDirective === 'style-src-elem' || v.effectiveDirective === 'style-src')

describe('<Toaster> under CSP style-src without unsafe-inline (#4825)', () => {
  it('control: the default inline <style> is refused — the harness sees the bug', async () => {
    const container = await mountToaster({})
    expect(styleElementViolations().length).toBeGreaterThan(0)
    expect(getComputedStyle(container).position).not.toBe('fixed')
  })

  it('`nonce` — the injected <style> is accepted and applies', async () => {
    const container = await mountToaster({ nonce: NONCE })
    expect(styleElementViolations().map((v) => v.effectiveDirective)).toEqual([])
    expect(getComputedStyle(container).position).toBe('fixed')
  })

  it('`injectStyles={false}` + `@pyreon/toast/styles.css` — no violation, the file applies', async () => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = new URL('../../styles.css', import.meta.url).href
    link.setAttribute('data-test-toast-css', '')
    const loaded = new Promise<void>((resolve, reject) => {
      link.onload = () => resolve()
      link.onerror = () => reject(new Error('styles.css failed to load'))
    })
    document.head.appendChild(link)
    await loaded

    const container = await mountToaster({ injectStyles: false })
    expect(document.head.querySelector('style[data-pyreon-toast]')).toBeNull()
    expect(violations.map((v) => `${v.effectiveDirective} ${v.blockedURI}`)).toEqual([])
    expect(getComputedStyle(container).position).toBe('fixed')
  })
})
