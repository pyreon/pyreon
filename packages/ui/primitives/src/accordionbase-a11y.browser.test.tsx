/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium lock for AccordionBase's WAI-ARIA Accordion pattern. The
 * ui-components `Accordion` shipped as an inert shell — its trigger was a bare
 * <button> with no aria-expanded, no open state, no keyboard — so this suite
 * locks the primitive that replaces it.
 *
 * The assertions are deliberately TRANSITION-based, not initial-state-based: a
 * suite that only asserts the collapsed state passes against a completely inert
 * accordion (that is exactly how the shell shipped). Every ARIA/DOM claim here
 * is re-read AFTER a real click.
 *
 * That transition is only observable because `aria-expanded` is emitted as an
 * ACCESSOR: this package's browser config uses plain oxc JSX (no reactive-prop
 * compiler), so a plain `aria-expanded={isExpanded() ? …}` would be snapshotted
 * at mount and never flip. The function value routes through applyProp's
 * renderEffect wrap instead, which is live under BOTH transforms.
 *
 * Bisect: drop the `type="button"` → the submit spec fails; make aria-expanded
 * a plain (non-accessor) ternary → the transition specs fail with
 * `expected 'false' to be 'true'`; drop `{...rest}` from any part → the
 * rest-forwarding spec fails (unstyled-component bug); swap the single-mode
 * branch of `toggle` for the multiple one → the "opening B collapses A" spec
 * fails.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import {
  AccordionBase,
  type AccordionBaseProps,
  AccordionContentBase,
  AccordionItemBase,
  AccordionTriggerBase,
} from './AccordionBase'

/** Mount a two-item accordion; every part carries a `class` to guard forwarding. */
function mountAccordion(props: Partial<AccordionBaseProps> = {}) {
  const { container, unmount } = mountInBrowser(
    h(
      AccordionBase as never,
      { ...props, class: 'acc' },
      h(
        AccordionItemBase as never,
        { value: 'a', class: 'item-a' },
        h(AccordionTriggerBase as never, { class: 'trig-a', id: undefined }, 'Trigger A'),
        h(AccordionContentBase as never, { class: 'cont-a' }, 'Panel A'),
      ),
      h(
        AccordionItemBase as never,
        { value: 'b', class: 'item-b' },
        h(AccordionTriggerBase as never, { class: 'trig-b' }, 'Trigger B'),
        h(AccordionContentBase as never, { class: 'cont-b' }, 'Panel B'),
      ),
    ),
  )

  const trigger = (v: string) =>
    container.querySelector(`[data-accordion-trigger][data-value="${v}"]`) as HTMLButtonElement
  // Content is identified by its forwarded class — its id is generated, and
  // looking it up by role would not prove WHICH item it belongs to.
  const content = (v: string) => container.querySelector(`.cont-${v}`) as HTMLElement | null

  return { container, unmount, trigger, content }
}

function click(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

function press(el: HTMLElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

describe('AccordionBase — WAI-ARIA accordion semantics', () => {
  it('flips aria-expanded "false" → "true" on click, and back on re-click', async () => {
    const { trigger, unmount } = mountAccordion()
    await flush()

    expect(trigger('a').getAttribute('aria-expanded')).toBe('false')

    click(trigger('a'))
    await flush()
    expect(trigger('a').getAttribute('aria-expanded')).toBe('true')

    // Re-click collapses — proves toggle, not a one-way latch.
    click(trigger('a'))
    await flush()
    expect(trigger('a').getAttribute('aria-expanded')).toBe('false')
    unmount()
  })

  it('renders the trigger as type="button" so it cannot submit a surrounding form', async () => {
    const { trigger, unmount } = mountAccordion()
    await flush()
    expect(trigger('a').getAttribute('type')).toBe('button')
    expect(trigger('a').type).toBe('button')
    unmount()
  })

  it('mounts the content only while expanded, with role=region + aria-labelledby → trigger', async () => {
    const { trigger, content, unmount } = mountAccordion()
    await flush()

    expect(content('a')).toBeNull()

    click(trigger('a'))
    await flush()

    const panel = content('a')!
    expect(panel).not.toBeNull()
    expect(panel.getAttribute('role')).toBe('region')
    expect(panel.textContent).toBe('Panel A')
    // The labelling relationship must resolve to THIS item's trigger.
    const labelledBy = panel.getAttribute('aria-labelledby')!
    expect(labelledBy).toBe(trigger('a').id)
    expect(trigger('a').id).toBeTruthy()

    click(trigger('a'))
    await flush()
    expect(content('a')).toBeNull()
    unmount()
  })

  it('resolves aria-controls to the real content id once open', async () => {
    const { container, trigger, content, unmount } = mountAccordion()
    await flush()

    const controls = trigger('a').getAttribute('aria-controls')!
    expect(controls).toBeTruthy()
    // Collapsed: the IDREF does not resolve yet (panel is unmounted).
    expect(container.querySelector(`#${CSS.escape(controls)}`)).toBeNull()

    click(trigger('a'))
    await flush()

    const panel = container.querySelector(`#${CSS.escape(controls)}`)
    expect(panel).not.toBeNull()
    expect(panel).toBe(content('a'))
    unmount()
  })

  it('gives each item a DISTINCT trigger/content id pair', async () => {
    const { trigger, unmount } = mountAccordion()
    await flush()
    expect(trigger('a').id).not.toBe(trigger('b').id)
    expect(trigger('a').getAttribute('aria-controls')).not.toBe(
      trigger('b').getAttribute('aria-controls'),
    )
    unmount()
  })
})

describe('AccordionBase — single vs multiple', () => {
  it('single (default): opening B collapses A', async () => {
    const { trigger, content, unmount } = mountAccordion()
    await flush()

    click(trigger('a'))
    await flush()
    expect(content('a')).not.toBeNull()

    click(trigger('b'))
    await flush()
    expect(content('b')).not.toBeNull()
    expect(content('a')).toBeNull()
    expect(trigger('a').getAttribute('aria-expanded')).toBe('false')
    expect(trigger('b').getAttribute('aria-expanded')).toBe('true')
    unmount()
  })

  it('multiple: A and B stay open independently', async () => {
    const { trigger, content, unmount } = mountAccordion({ multiple: true })
    await flush()

    click(trigger('a'))
    click(trigger('b'))
    await flush()

    expect(content('a')).not.toBeNull()
    expect(content('b')).not.toBeNull()
    expect(trigger('a').getAttribute('aria-expanded')).toBe('true')
    expect(trigger('b').getAttribute('aria-expanded')).toBe('true')

    // Collapsing one leaves the other untouched.
    click(trigger('a'))
    await flush()
    expect(content('a')).toBeNull()
    expect(content('b')).not.toBeNull()
    unmount()
  })

  it('honours defaultValue in both shapes (string and string[])', async () => {
    const single = mountAccordion({ defaultValue: 'b' })
    await flush()
    expect(single.trigger('b').getAttribute('aria-expanded')).toBe('true')
    expect(single.content('b')).not.toBeNull()
    expect(single.content('a')).toBeNull()
    single.unmount()

    const multi = mountAccordion({ multiple: true, defaultValue: ['a', 'b'] })
    await flush()
    expect(multi.content('a')).not.toBeNull()
    expect(multi.content('b')).not.toBeNull()
    multi.unmount()
  })

  it('emits the canonical shape per mode: string when single, string[] when multiple', async () => {
    const singleSeen: unknown[] = []
    const single = mountAccordion({ onChange: (v) => singleSeen.push(v) })
    await flush()
    click(single.trigger('a'))
    click(single.trigger('b'))
    await flush()
    // Expand A → 'a'; expand B → 'b' (single: the value IS the open item).
    expect(singleSeen).toEqual(['a', 'b'])
    single.unmount()

    const multiSeen: unknown[] = []
    const multi = mountAccordion({ multiple: true, onChange: (v) => multiSeen.push(v) })
    await flush()
    click(multi.trigger('a'))
    click(multi.trigger('b'))
    await flush()
    expect(multiSeen).toEqual([['a'], ['a', 'b']])
    multi.unmount()
  })

  it('normalizes a bare string value on a multiple accordion (liberal read)', async () => {
    // `value` is controlled here, so the accordion reads the string shape even
    // though `multiple` would emit arrays — toList must not yield ['a'] → ['a'].
    const { content, unmount } = mountAccordion({ multiple: true, value: 'a' })
    await flush()
    expect(content('a')).not.toBeNull()
    expect(content('b')).toBeNull()
    unmount()
  })
})

describe('AccordionBase — keyboard', () => {
  it('ArrowDown moves focus to the next trigger', async () => {
    const { trigger, unmount } = mountAccordion()
    await flush()

    trigger('a').focus()
    expect(document.activeElement).toBe(trigger('a'))

    press(trigger('a'), 'ArrowDown')
    await flush()
    expect(document.activeElement).toBe(trigger('b'))
    unmount()
  })

  it('ArrowUp moves focus to the previous trigger; Home/End jump to the ends', async () => {
    const { trigger, unmount } = mountAccordion()
    await flush()

    trigger('b').focus()
    press(trigger('b'), 'ArrowUp')
    await flush()
    expect(document.activeElement).toBe(trigger('a'))

    press(trigger('a'), 'End')
    await flush()
    expect(document.activeElement).toBe(trigger('b'))

    press(trigger('b'), 'Home')
    await flush()
    expect(document.activeElement).toBe(trigger('a'))
    unmount()
  })

  it('moving focus does NOT expand — the APG accordion does not activate on focus', async () => {
    const { trigger, content, unmount } = mountAccordion()
    await flush()

    trigger('a').focus()
    press(trigger('a'), 'ArrowDown')
    await flush()

    expect(document.activeElement).toBe(trigger('b'))
    expect(content('a')).toBeNull()
    expect(content('b')).toBeNull()
    expect(trigger('b').getAttribute('aria-expanded')).toBe('false')
    unmount()
  })

})

/**
 * Enter/Space activation is NOT hand-wired — the primitive relies on a native
 * <button> synthesizing `click` from those keys. That reliance is only provable
 * with TRUSTED input: a synthetic `dispatchEvent(new KeyboardEvent)` is
 * untrusted and never runs a button's default activation behaviour, so this
 * file's `press()` helper CANNOT prove it (an earlier draft of these specs
 * "passed" only because of a fallback that quietly clicked for them — i.e. they
 * asserted nothing). `userEvent` drives real CDP input instead.
 *
 * This file ALSO runs under happy-dom (the package's node config does not
 * exclude `.browser.test.*`), where CDP-driven trusted input is definitionally
 * impossible — hence the gate on vitest's own `__vitest_browser__` marker. The
 * gate is NOT a silent skip: inside the browser runner the driver's presence is
 * asserted, so these specs can never quietly stop covering the real Chromium
 * path. `@vitest/browser/context` is imported dynamically because a static
 * import throws at module load in the forks pool.
 */
const IS_BROWSER_RUNNER = (globalThis as Record<string, unknown>).__vitest_browser__ === true

describe.runIf(IS_BROWSER_RUNNER)('AccordionBase — native activation (trusted input)', () => {
  it('Enter activates the trigger via the native button behaviour', async () => {
    const { userEvent } = await import('@vitest/browser/context')
    expect(userEvent, 'trusted-input driver must exist in the browser runner').toBeDefined()

    const { trigger, content, unmount } = mountAccordion()
    await flush()
    expect(content('a')).toBeNull()

    trigger('a').focus()
    await userEvent.keyboard('{Enter}')
    await flush()

    expect(content('a')).not.toBeNull()
    expect(trigger('a').getAttribute('aria-expanded')).toBe('true')
    unmount()
  })

  it('Space activates the trigger via the native button behaviour', async () => {
    const { userEvent } = await import('@vitest/browser/context')
    const { trigger, content, unmount } = mountAccordion()
    await flush()
    expect(content('a')).toBeNull()

    trigger('a').focus()
    await userEvent.keyboard(' ')
    await flush()

    expect(content('a')).not.toBeNull()
    expect(trigger('a').getAttribute('aria-expanded')).toBe('true')
    unmount()
  })
})

describe('AccordionBase — rest forwarding (unstyled-component guard)', () => {
  it('forwards consumer props onto the rendered element of EVERY part', async () => {
    const { container, trigger, content, unmount } = mountAccordion()
    await flush()

    // The root + item + trigger render immediately; the content only once open.
    expect(container.querySelector('.acc')).not.toBeNull()
    expect(container.querySelector('.acc')!.hasAttribute('data-accordion')).toBe(true)
    expect(container.querySelector('.item-a')).not.toBeNull()
    expect(trigger('a').classList.contains('trig-a')).toBe(true)

    click(trigger('a'))
    await flush()
    expect(content('a')!.classList.contains('cont-a')).toBe(true)
    unmount()
  })

  it('does not let a forwarded prop clobber the primitive semantics', async () => {
    const { trigger, unmount } = mountAccordion()
    await flush()
    // `id: undefined` was passed to trigger A by the harness — the primitive's
    // own generated id must still win, or aria-labelledby would dangle.
    expect(trigger('a').id).toBeTruthy()
    unmount()
  })
})
