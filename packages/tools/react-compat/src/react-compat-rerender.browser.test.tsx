import type { VNodeChild } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { jsx } from './jsx-runtime'
import { useState } from './index'

/**
 * Real-browser regression test for the react-compat re-render path.
 *
 * The compat wrapper schedules re-renders via `scheduleRerender` →
 * `queueMicrotask` → `version.set(...)`. Pyreon's `mountReactive`
 * detects the version change and re-runs the accessor, which re-runs
 * the user component and produces a new VNode tree. mountReactive
 * tears down the old subtree and mounts the new one.
 *
 * **Important**: react-compat does FULL DOM REPLACEMENT on every
 * re-render — there is no VDOM diffing in the compat layer (Pyreon's
 * native pattern is fine-grained reactivity, not whole-component
 * re-renders). Tests that capture a DOM reference BEFORE click and
 * then assert on it AFTER click will see stale content because the
 * captured reference points to a now-detached node. **Always re-query
 * the DOM after a state change**.
 *
 * Phase A2's smoke for react-compat held a stale reference and
 * appeared to show the wrapper was broken; this test characterises
 * the correct behavior + the re-query gotcha so future authors don't
 * trip on the same edge.
 */
describe('@pyreon/react-compat — real-browser re-render', () => {
  it('clicking a button increments useState count and DOM reflects', async () => {
    function Counter(): VNodeChild {
      const [count, setCount] = useState(0)
      return jsx('button', {
        id: 'rc-counter',
        onClick: () => setCount((n: number) => n + 1),
        children: `count: ${count}`,
      })
    }

    const { container, unmount } = mountInBrowser(jsx(Counter, {}))
    // Read 1: initial mount
    expect(container.querySelector('#rc-counter')!.textContent).toBe('count: 0')

    // Click the CURRENT button — re-query after each interaction because
    // react-compat replaces the DOM subtree on re-render (see file-level
    // doc comment).
    container.querySelector<HTMLButtonElement>('#rc-counter')!.click()
    await flush()
    await flush()
    expect(container.querySelector('#rc-counter')!.textContent).toBe('count: 1')

    container.querySelector<HTMLButtonElement>('#rc-counter')!.click()
    await flush()
    await flush()
    expect(container.querySelector('#rc-counter')!.textContent).toBe('count: 2')

    unmount()
  })
})
