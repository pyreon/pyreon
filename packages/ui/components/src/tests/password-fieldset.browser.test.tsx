/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium locks for PasswordInput + Fieldset (2026-07-21 audit, roadmap
 * B13 + B17 — two missing market staples).
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { describe, expect, it } from 'vitest'
import Fieldset, { FieldsetLegend } from '../components/Fieldset'
import PasswordInput from '../components/PasswordInput'

describe('PasswordInput (real Chromium)', () => {
  it('renders type=password; the toggle flips to text + aria-pressed + label', async () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(PasswordInput as never, { placeholder: 'Secret' })),
    )
    await flush()
    const input = container.querySelector('[data-password-input]') as HTMLInputElement
    const toggle = container.querySelector('[data-password-toggle]') as HTMLButtonElement
    expect(input.type).toBe('password')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(toggle.getAttribute('aria-label')).toBe('Show password')
    // The toggle must never submit a form.
    expect(toggle.getAttribute('type')).toBe('button')

    toggle.click()
    await flush()
    expect(input.type, 'visibility toggle must flip the input type').toBe('text')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(toggle.getAttribute('aria-label')).toBe('Hide password')

    toggle.click()
    await flush()
    expect(input.type).toBe('password')
    unmount()
  })

  it('custom show/hide labels are honored', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(PasswordInput as never, { showLabel: 'Zobrazit heslo', hideLabel: 'Skrýt heslo' }),
      ),
    )
    await flush()
    const toggle = container.querySelector('[data-password-toggle]') as HTMLElement
    expect(toggle.getAttribute('aria-label')).toBe('Zobrazit heslo')
    toggle.click()
    await flush()
    expect(toggle.getAttribute('aria-label')).toBe('Skrýt heslo')
    unmount()
  })
})

describe('Fieldset (real Chromium)', () => {
  it('renders a real <fieldset> with a real <legend>', async () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(
          Fieldset as never,
          { 'data-testid': 'fs' },
          h(FieldsetLegend as never, {}, 'Shipping address'),
          h('input', { type: 'text' }),
        ),
      ),
    )
    await flush()
    const fs = container.querySelector('[data-testid="fs"]') as HTMLElement
    expect(fs.tagName).toBe('FIELDSET')
    const legend = fs.querySelector('legend')
    expect(legend, 'legend must be a real <legend> inside the fieldset').not.toBeNull()
    expect(legend!.textContent).toBe('Shipping address')
    unmount()
  })
})
