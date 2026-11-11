/** @jsxImportSource @pyreon/core */
/**
 * The documented scroll-reveal pattern, end to end in real Chromium (#4329).
 *
 * `useIntersection(() => node)` needs the element through the kinetic
 * component's `ref`. `TransitionRenderer` used to put its own ref last over the
 * consumer's, so `node` stayed null, nothing was observed, `show` never turned
 * true and the content sat at `opacity: 0` forever. happy-dom has no
 * IntersectionObserver and no layout, so only a real browser proves the reveal.
 */
import { describe, expect, it } from 'vitest'
import type { VNodeChild } from '@pyreon/core'
import { useIntersection } from '@pyreon/hooks'
import { computed } from '@pyreon/reactivity'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import kinetic from '../kinetic'

const RevealBox = kinetic('div')
  .enter({ opacity: 0, transform: 'translateY(16px)' })
  .enterTo({ opacity: 1, transform: 'none' })
  .enterTransition('opacity .1s, transform .1s')

function Reveal(props: { children?: VNodeChild }) {
  let node: HTMLElement | null = null
  const entry = useIntersection(() => node, { threshold: 0.08 })
  const show = computed(() => entry()?.isIntersecting === true)
  return (
    <RevealBox
      ref={(n: HTMLElement | null) => {
        node = n
      }}
      show={() => show()}
      data-testid="reveal"
    >
      {props.children}
    </RevealBox>
  )
}

const waitFor = async (check: () => boolean, ms = 3000): Promise<boolean> => {
  const deadline = performance.now() + ms
  while (performance.now() < deadline) {
    if (check()) return true
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
  return check()
}

describe('kinetic scroll-reveal through a consumer ref', () => {
  it('stays hidden below the fold and reveals once scrolled into view', async () => {
    const { container, unmount } = mountInBrowser(
      <div>
        <div style={{ height: '3000px' }}>spacer</div>
        <Reveal>
          <p>revealed content</p>
        </Reveal>
      </div>,
    )
    const el = container.querySelector<HTMLElement>('[data-testid="reveal"]')
    expect(el?.textContent).toBe('revealed content')
    const opacity = () => Number(getComputedStyle(el as HTMLElement).opacity)

    // Below the fold: still in its hidden state after a few frames.
    await waitFor(() => false, 150)
    expect(opacity()).toBe(0)

    el?.scrollIntoView()
    const revealed = await waitFor(() => opacity() === 1)
    expect(revealed, `opacity after scrolling into view: ${opacity()}`).toBe(true)

    window.scrollTo(0, 0)
    unmount()
  })
})
