import { describe, expect, it, vi } from 'vitest'
import { runWithHooks } from '@pyreon/core'
import { useFlow } from '../use-flow'

describe('useFlow', () => {
  it('returns a flow instance bound to onUnmount for auto-disposal', () => {
    const disposeSpy = vi.fn()
    const run = runWithHooks(() => {
      const flow = useFlow({
        nodes: [{ id: '1', position: { x: 0, y: 0 }, data: {} }],
        edges: [],
      })
      // Patch dispose so we can assert it runs on unmount without caring
      // about the full internal teardown.
      const original = flow.dispose
      flow.dispose = () => {
        disposeSpy()
        original.call(flow)
      }
      expect(flow.nodes()).toHaveLength(1)
      return null
    }, {})

    expect(disposeSpy).not.toHaveBeenCalled()
    for (const fn of run.hooks.unmount!) fn()
    expect(disposeSpy).toHaveBeenCalledTimes(1)
  })
})
