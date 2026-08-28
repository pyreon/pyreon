import { query } from '@pyreon/test-utils'
import { h } from '@pyreon/core'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { afterEach, describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './index'

/**
 * Accordion was inert: styled <div>s + a bare <button> with no aria-expanded,
 * no controlled state, no keyboard — so every consumer hand-rolled the whole
 * disclosure. It now delegates to AccordionBase. These lock the WIRING (the
 * primitive's own behavior is covered by accordionbase-a11y.browser.test.tsx);
 * per the #2372 lesson, "delegates" != "works" — the class must land too.
 */
describe('Accordion delegates to AccordionBase', () => {
  let cleanup: (() => void) | undefined
  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  const render = () =>
    mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(
          Accordion as never,
          { defaultValue: 'a' },
          h(
            AccordionItem as never,
            { value: 'a' },
            h(AccordionTrigger as never, null, 'First'),
            h(AccordionContent as never, null, 'Panel A'),
          ),
        ),
      ),
    )

  it('renders a real disclosure: aria-expanded + linked region', () => {
    const { container, unmount } = render()
    cleanup = unmount
    const trigger = query<HTMLElement>(container, 'button')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const region = query<HTMLElement>(container, '[role="region"]')
    expect(region).toBeTruthy()
    // aria-controls <-> id and aria-labelledby <-> trigger id must link up
    expect(trigger.getAttribute('aria-controls')).toBe(region.getAttribute('id'))
    expect(region.getAttribute('aria-labelledby')).toBe(trigger.getAttribute('id'))
  })

  it('the trigger is type=button (cannot submit a surrounding form)', () => {
    const { container, unmount } = render()
    cleanup = unmount
    expect((query<HTMLButtonElement>(container, 'button')).type).toBe('button')
  })

  it('collapses on click — the primitive owns the state', () => {
    const { container, unmount } = render()
    cleanup = unmount
    const trigger = query<HTMLElement>(container, 'button')
    trigger.click()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[role="region"]')).toBeNull()
  })

  it('applies its rocketstyle class to each part ("delegates" != "works")', () => {
    const { container, unmount } = render()
    cleanup = unmount
    const trigger = query<HTMLElement>(container, '[data-rocketstyle="AccordionTrigger"]')
    expect(trigger).toBeTruthy()
    expect(trigger.className).toBeTruthy()
    expect(container.querySelector('[data-rocketstyle="Accordion"]')).toBeTruthy()
    expect(container.querySelector('[data-rocketstyle="AccordionItem"]')).toBeTruthy()
    expect(container.querySelector('[data-rocketstyle="AccordionContent"]')).toBeTruthy()
  })
})
