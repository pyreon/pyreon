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
    const trigger = container.querySelector('button') as HTMLElement
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const region = container.querySelector('[role="region"]') as HTMLElement
    expect(region).toBeTruthy()
    // aria-controls <-> id and aria-labelledby <-> trigger id must link up
    expect(trigger.getAttribute('aria-controls')).toBe(region.getAttribute('id'))
    expect(region.getAttribute('aria-labelledby')).toBe(trigger.getAttribute('id'))
  })

  it('the trigger is type=button (cannot submit a surrounding form)', () => {
    const { container, unmount } = render()
    cleanup = unmount
    expect((container.querySelector('button') as HTMLButtonElement).type).toBe('button')
  })

  it('collapses on click — the primitive owns the state', () => {
    const { container, unmount } = render()
    cleanup = unmount
    const trigger = container.querySelector('button') as HTMLElement
    trigger.click()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[role="region"]')).toBeNull()
  })

  it('applies its rocketstyle class to each part ("delegates" != "works")', () => {
    const { container, unmount } = render()
    cleanup = unmount
    const trigger = container.querySelector('[data-rocketstyle="AccordionTrigger"]') as HTMLElement
    expect(trigger).toBeTruthy()
    expect(trigger.className).toBeTruthy()
    expect(container.querySelector('[data-rocketstyle="Accordion"]')).toBeTruthy()
    expect(container.querySelector('[data-rocketstyle="AccordionItem"]')).toBeTruthy()
    expect(container.querySelector('[data-rocketstyle="AccordionContent"]')).toBeTruthy()
  })
})
