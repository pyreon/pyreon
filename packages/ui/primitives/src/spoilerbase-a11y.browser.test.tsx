import { h } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { SpoilerBase } from './SpoilerBase'
import type { SpoilerState } from './SpoilerBase'

/**
 * SpoilerBase — truncate-with-"show more".
 *
 * The behaviour that only a REAL browser can verify is the measurement: the
 * toggle exists only when the content OVERFLOWS maxHeight, and that requires
 * layout + ResizeObserver. happy-dom reports 0 for every height, so the
 * overflow specs are Chromium-gated; the ARIA/state-machine specs run in both.
 */
declare const __vitest_browser__: boolean | undefined
const isBrowser = typeof __vitest_browser__ !== 'undefined' && __vitest_browser__

/** rAF twice: once for ResizeObserver delivery, once for the resulting render. */
const settle = () =>
  new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))

function mountSpoiler(opts: { height: number; maxHeight?: number } & Record<string, unknown>) {
  const { height, ...rest } = opts
  let st: SpoilerState | undefined
  const { container } = mountInBrowser(
    h(SpoilerBase as never, {
      maxHeight: 100,
      ...rest,
      children: (s: SpoilerState) => {
        st = s
        return h('div', s.rootProps(), [
          h('div', s.clipProps(),
            h('div', s.contentProps(),
              h('div', { style: `height: ${height}px;`, 'data-filler': '' }, 'content'))),
          h('button', s.toggleProps(), 'toggle'),
        ])
      },
    }),
  )
  return {
    container,
    state: () => st!,
    root: () => container.querySelector('[data-spoiler]') as HTMLElement,
    clip: () => container.querySelector('[data-spoiler] > div') as HTMLElement,
    content: () => container.querySelector(`#${CSS.escape(st!.contentProps().id as string)}`) as HTMLElement,
    toggle: () => container.querySelector('button') as HTMLButtonElement,
    filler: () => container.querySelector('[data-filler]') as HTMLElement,
  }
}

describe('SpoilerBase — state + ARIA', () => {
  it('wires aria-expanded/aria-controls to the content, and keeps them LIVE', () => {
    const { toggle, content, state } = mountSpoiler({ height: 400 })
    expect(toggle().getAttribute('aria-controls')).toBe(content().id)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    state().expand()
    // A value would have frozen at "false" through the one-time spread.
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    state().collapse()
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('toggles on click', () => {
    const { toggle, state } = mountSpoiler({ height: 400 })
    expect(state().expanded()).toBe(false)
    toggle().click()
    expect(state().expanded()).toBe(true)
    toggle().click()
    expect(state().expanded()).toBe(false)
  })

  it('is type=button so it cannot submit a surrounding form', () => {
    const { toggle } = mountSpoiler({ height: 400 })
    expect(toggle().type).toBe('button')
  })

  it('honours defaultExpanded (uncontrolled)', () => {
    const { toggle, state } = mountSpoiler({ height: 400, defaultExpanded: true })
    expect(state().expanded()).toBe(true)
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
  })

  it('is controllable — an external value wins and onExpandedChange reports', () => {
    const seen: boolean[] = []
    const { toggle, state } = mountSpoiler({
      height: 400,
      expanded: false,
      onExpandedChange: (v: boolean) => seen.push(v),
    })
    toggle().click()
    expect(seen).toEqual([true])
    // Controlled: the prop is fixed at false, so the state must NOT self-update.
    expect(state().expanded()).toBe(false)
  })

  it('marks the expanded state on the root for styling', () => {
    const { root, state } = mountSpoiler({ height: 400 })
    expect(root().hasAttribute('data-expanded')).toBe(false)
    state().expand()
    expect(root().hasAttribute('data-expanded')).toBe(true)
  })
})

describe.runIf(isBrowser)('SpoilerBase — measurement (needs real layout)', () => {
  it('needsToggle is TRUE when the content overflows maxHeight', async () => {
    const { state } = mountSpoiler({ height: 400, maxHeight: 100 })
    await settle()
    expect(state().contentHeight()).toBeGreaterThan(100)
    expect(state().needsToggle()).toBe(true)
  })

  it('needsToggle is FALSE when the content already fits', async () => {
    const { state } = mountSpoiler({ height: 40, maxHeight: 100 })
    await settle()
    // A spoiler whose content fits must not offer a "Show more" that does nothing.
    expect(state().needsToggle()).toBe(false)
  })

  it('measures the NATURAL height — the measured element must not be clipped', async () => {
    const { state, content, clip } = mountSpoiler({ height: 400, maxHeight: 100 })
    await settle()
    // The clip is on a DIFFERENT element. If the clip ever moved onto the
    // measured element, ResizeObserver would report contentRect = the CLIPPED
    // 100px, needsToggle would be permanently false, and the toggle would
    // never appear for any content.
    expect(state().contentHeight()).toBe(400)
    expect(clip().style.maxHeight).toBe('100px')
    expect(content().style.maxHeight).toBe('')
  })

  it('clips to maxHeight collapsed, and to the MEASURED height expanded', async () => {
    const { clip, state } = mountSpoiler({ height: 400, maxHeight: 100 })
    await settle()
    expect(clip().style.maxHeight).toBe('100px')
    expect(clip().style.overflow).toBe('hidden')
    state().expand()
    // Pins to the measured height, not `none` — `none` cannot be transitioned.
    expect(clip().style.maxHeight).toBe('400px')
  })

  it('re-measures when the content grows (ResizeObserver, not a one-shot read)', async () => {
    const { state, filler } = mountSpoiler({ height: 40, maxHeight: 100 })
    await settle()
    expect(state().needsToggle()).toBe(false)
    filler().style.height = '500px'
    await settle()
    // A one-shot measurement at mount would still say false here.
    expect(state().needsToggle()).toBe(true)
    expect(state().contentHeight()).toBeGreaterThan(100)
  })
})
