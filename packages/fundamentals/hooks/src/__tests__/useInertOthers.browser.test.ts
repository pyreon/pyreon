/**
 * Real-Chromium regression lock for `useInertOthers`.
 *
 * The unit suite (`useInertOthers.test.ts`) drives the refcount / snapshot
 * logic under happy-dom; this suite asserts the REAL browser consequence —
 * the native `inert` attribute makes background content unfocusable — plus
 * the stacked-overlay refcount and exact-restore contracts against real DOM.
 *
 * Bisect lines are documented per spec.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { useInertOthers } from '../useInertOthers'

const disposers: Array<() => void> = []
const strayNodes: HTMLElement[] = []

function armInert(getEl: () => HTMLElement | null): () => void {
  const { unmount } = mountInBrowser(
    h(
      () => {
        useInertOthers(getEl)
        return null
      },
      {},
    ),
  )
  disposers.push(unmount)
  return unmount
}

function addNode(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  document.body.appendChild(el)
  strayNodes.push(el)
  return el
}

afterEach(() => {
  disposers.splice(0).forEach((d) => {
    d()
  })
  strayNodes.splice(0).forEach((n) => {
    n.remove()
  })
  document.body.innerHTML = ''
})

describe('useInertOthers (real Chromium)', () => {
  // Bisect: revert acquireInert's setAttribute → the background button stays
  // focusable and both assertions fail.
  it('makes background siblings inert (really unfocusable), restores on dispose', async () => {
    const background = addNode('<button id="bg">background</button>')
    const modal = addNode('<button id="in">inside</button>')
    const bgBtn = background.querySelector<HTMLButtonElement>('#bg')!

    const dispose = armInert(() => modal)
    await flush()

    expect(background.hasAttribute('inert')).toBe(true)
    expect(modal.hasAttribute('inert')).toBe(false)
    // The REAL consequence: an inert subtree cannot receive focus.
    bgBtn.focus()
    expect(document.activeElement).not.toBe(bgBtn)

    dispose()
    await flush()
    expect(background.hasAttribute('inert')).toBe(false)
    bgBtn.focus()
    expect(document.activeElement).toBe(bgBtn)
  })

  // Bisect: replace the per-element refcount with naive set/remove → the
  // inner overlay's dispose un-inerts the shared background while the outer
  // still needs it, and the mid-assertions fail.
  it('stacked overlays: inner dispose must not un-inert what the outer holds', async () => {
    const background = addNode('<button>bg</button>')
    const modalA = addNode('<button>a</button>')

    armInert(() => modalA)
    await flush()

    // The inner modal mounts AFTER the outer applied (the real stacked-modal
    // flow — a portal appended to body while A is open), so it is not in A's
    // target set and stays interactive.
    const modalB = addNode('<button>b</button>')
    const disposeB = armInert(() => modalB)
    await flush()

    expect(background.hasAttribute('inert')).toBe(true)
    expect(modalA.hasAttribute('inert')).toBe(true) // outer is behind the inner
    expect(modalB.hasAttribute('inert')).toBe(false)

    disposeB()
    await flush()
    expect(modalA.hasAttribute('inert')).toBe(false) // outer interactive again
    expect(background.hasAttribute('inert')).toBe(true) // outer still holds it
  })

  // Bisect: drop the `previouslyInert` snapshot → dispose blanket-removes the
  // attribute and the final assertion fails.
  it('an element that was ALREADY inert stays inert after dispose', async () => {
    const alreadyInert = addNode('<button>x</button>')
    alreadyInert.setAttribute('inert', '')
    const modal = addNode('<button>in</button>')

    const dispose = armInert(() => modal)
    await flush()
    expect(alreadyInert.hasAttribute('inert')).toBe(true)

    dispose()
    await flush()
    expect(alreadyInert.hasAttribute('inert')).toBe(true)
  })

  it('follows a signal-backed getter through mount/unmount of the element', async () => {
    const background = addNode('<button>bg</button>')
    const modal = addNode('<button>in</button>')
    const el = signal<HTMLElement | null>(null)

    armInert(() => el())
    await flush()
    expect(background.hasAttribute('inert')).toBe(false)

    el.set(modal)
    await flush()
    expect(background.hasAttribute('inert')).toBe(true)

    el.set(null)
    await flush()
    expect(background.hasAttribute('inert')).toBe(false)
  })

  it('leaves live regions alone so announcements keep working', async () => {
    const live = addNode('')
    live.setAttribute('aria-live', 'polite')
    const modal = addNode('<button>in</button>')

    armInert(() => modal)
    await flush()
    expect(live.hasAttribute('inert')).toBe(false)
  })
})
