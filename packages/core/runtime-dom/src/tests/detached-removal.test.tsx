/**
 * FW-3 regression: conditional-slot removal must NOT depend on the mount root
 * being attached to `document`.
 *
 * Toggling `{cond && <span/>}` / `<Show>` / ternary into a DETACHED container
 * (a bare `document.createElement('div')` never appended — ubiquitous in unit
 * tests) used to leak: the old node was never removed and new ones accumulated.
 * Cause: the removal guard was `parent.isConnected !== false`, and a detached
 * parent has `isConnected === false`, so `removeChild` was skipped. That
 * conflated "detached by `clearBetween`" (a DocumentFragment — the case the
 * skip legitimately optimizes) with "the whole mount root is detached from
 * document" (a real Element container). The fix keys the skip on
 * `nodeType === 11` (DocumentFragment) instead.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountChild } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'

function toggleCounts(attached: boolean): number[] {
  const container = document.createElement('div')
  if (attached) document.body.appendChild(container)
  const cond = signal(true)
  mountChild(() => (cond() ? h('span', { id: 'x' }) : null), container, null)
  const counts = [container.querySelectorAll('span').length]
  cond.set(false)
  counts.push(container.querySelectorAll('span').length)
  cond.set(true)
  counts.push(container.querySelectorAll('span').length)
  cond.set(false)
  counts.push(container.querySelectorAll('span').length)
  if (attached) container.remove()
  return counts // expect [1, 0, 1, 0] for both attached AND detached
}

describe('FW-3 — conditional-slot removal works on a detached container', () => {
  it('removes the old node when the container is DETACHED (was leaking)', () => {
    expect(toggleCounts(false)).toEqual([1, 0, 1, 0])
  })

  it('still works when the container is ATTACHED (unchanged)', () => {
    expect(toggleCounts(true)).toEqual([1, 0, 1, 0])
  })
})
