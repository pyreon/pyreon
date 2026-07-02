/**
 * Regression lock: the dev-mode devtools component registry must never act
 * as a GC root for DOM.
 *
 * `registerComponent` captures the component's first element at mount time
 * into the module-level `_components` Map. Pre-fix the entry held a STRONG
 * `el` reference — so when a component's DOM was later replaced by a
 * reactive re-render (component still mounted → `unregisterComponent` never
 * fires), the ORIGINAL element and its whole subtree stayed pinned as
 * detached DOM for the component's lifetime. Found via a real heap snapshot
 * of a downstream app: detached `<div class="metric-card">` trees retained
 * through `_components → entry → el`.
 *
 * The fix backs `entry.el` with a `WeakRef` getter: reads stay identical
 * for live elements (overlay hover walk, highlight()), and a replaced /
 * discarded element becomes GC-eligible immediately.
 *
 * GC-observable proof requires `--expose-gc` (wired via the package vitest
 * config's execArgv — same harness as for-lis-scratch-release).
 */
import { describe, expect, it } from 'vitest'
import { installDevTools, registerComponent, unregisterComponent } from '../devtools'

const hasGc = typeof globalThis.gc === 'function'

async function collectGarbage(): Promise<void> {
  // Two passes with a macrotask between them — finalization of DOM-shaped
  // object graphs can need a second sweep after the first pass clears the
  // retaining edges.
  globalThis.gc!()
  await new Promise((r) => setTimeout(r, 0))
  globalThis.gc!()
}

function getEntry(id: string) {
  installDevTools()
  const devtools = (globalThis as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
    getAllComponents(): { id: string; el: Element | null }[]
  }
  return devtools.getAllComponents().find((e) => e.id === id)
}

describe('devtools registry — el is weakly held', () => {
  it('entry.el reads the element while it is alive', () => {
    const el = document.createElement('div')
    el.className = 'live-probe'
    registerComponent('wr-live', 'Probe', el, null)
    try {
      const entry = getEntry('wr-live')
      expect(entry?.el).toBe(el)
    } finally {
      unregisterComponent('wr-live')
    }
  })

  it('entry.el registers null cleanly (component with no DOM)', () => {
    registerComponent('wr-null', 'NoDom', null, null)
    try {
      expect(getEntry('wr-null')?.el).toBeNull()
    } finally {
      unregisterComponent('wr-null')
    }
  })

  describe.skipIf(!hasGc)('GC contract (--expose-gc)', () => {
    it('a replaced element becomes GC-eligible while the entry stays registered', async () => {
      // Simulates the real bug shape: component mounts, registry captures
      // its first element, the component's DOM is later replaced by a
      // reactive re-render — the component is NOT unmounted, so the entry
      // stays in the registry for the app's lifetime.
      let el: Element | null = document.createElement('div')
      el.className = 'metric-card'
      el.appendChild(document.createElement('span'))
      const witness = new WeakRef(el)
      registerComponent('wr-gc', 'MetricCard', el, null)

      try {
        // Drop every strong ref the test holds — the registry entry is now
        // the only candidate retainer (pre-fix: a strong `el` property).
        el = null
        await collectGarbage()

        // Pre-fix (strong ref): witness.deref() stays live and entry.el
        // still returns the detached element — this assertion fails with
        // "expected <div.metric-card> to be undefined".
        expect(witness.deref()).toBeUndefined()
        expect(getEntry('wr-gc')?.el).toBeNull()
      } finally {
        unregisterComponent('wr-gc')
      }
    })
  })
})
