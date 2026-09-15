/**
 * The preview ref where the runtime has no `MutationObserver`.
 *
 * The re-probe is driven by an observer rather than by a reactive effect on
 * (selection, values, pseudo state) because that list was a guess at what
 * changes the rendered output. But the workbench also runs where the observer
 * does not exist, and the model guards for it — so this file takes that arm by
 * removing the global, which is the only input that reaches it.
 *
 * Its own file: the global is process-wide, and a sibling case that DOES rely
 * on the observer would silently stop observing if the removal leaked.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { WorkbenchCatalog } from '../catalog'
import { createModel } from '../model'

const CATALOG: WorkbenchCatalog = {
  components: [
    {
      id: 'button',
      name: 'button',
      group: 'G',
      controls: [],
      render: () => 'button',
    },
  ],
}

const real = globalThis.MutationObserver

afterEach(() => {
  globalThis.MutationObserver = real
  history.replaceState(null, '', '/')
})

const withoutObserver = (run: () => void): void => {
  // @ts-expect-error — removing a global is the point of the case.
  delete globalThis.MutationObserver
  expect(typeof MutationObserver).toBe('undefined')
  run()
}

describe('previewRef with no MutationObserver', () => {
  it('still probes the a11y verdict ONCE, on attach', () => {
    withoutObserver(() => {
      const m = createModel(CATALOG, {})
      const el = document.createElement('div')
      el.innerHTML = '<img src="a.png">'
      document.body.append(el)
      m.previewRef(el)
      // The one-shot probe is what keeps the panel useful; only the re-probe
      // needs the observer.
      expect(m.a11y().fails).toBeGreaterThan(0)
    })
  })

  it('does not throw on attach, and the direction effect still applies', () => {
    withoutObserver(() => {
      const m = createModel(CATALOG, {})
      const el = document.createElement('div')
      el.innerHTML = '<button>Go</button>'
      document.body.append(el)
      expect(() => m.previewRef(el)).not.toThrow()
      expect(el.getAttribute('dir')).toBe('ltr')
    })
  })

  it('detaching is still clean with no observer to disconnect', () => {
    withoutObserver(() => {
      const m = createModel(CATALOG, {})
      const el = document.createElement('div')
      el.innerHTML = '<button>Go</button>'
      m.previewRef(el)
      expect(() => m.previewRef(null)).not.toThrow()
      expect(m.previewElement()).toBeNull()
    })
  })

  it('WITH the observer restored, the same shape re-probes on a mutation', async () => {
    // The pairing: the guard above is a degradation, not the behaviour.
    const m = createModel(CATALOG, {})
    const el = document.createElement('div')
    el.innerHTML = '<button>Go</button>'
    document.body.append(el)
    m.previewRef(el)
    expect(m.a11y().fails).toBe(0)
    el.firstElementChild!.replaceWith(document.createElement('img'))
    await new Promise((r) => setTimeout(r, 0))
    expect(m.a11y().fails).toBeGreaterThan(0)
  })
})
