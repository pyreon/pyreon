// React runs an unmounting subtree's effect cleanups parent before child
// (react-reconciler, ReactFiberCommitWork:
// commitPassiveUnmountEffectsInsideOfDeletedTree_begin visits a fiber before
// its children; layout cleanups on deletion likewise recurse after the
// parent). Preact's options._unmount runs the component's hook cleanups
// before unmounting its children as well.
import { mount } from '@pyreon/runtime-dom'
import { useEffect, useLayoutEffect } from '../index'
import { jsx } from '../jsx-runtime'

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

describe('unmount cleanup order', () => {
  test('parent cleanups run before child cleanups, for useEffect and useLayoutEffect', async () => {
    const log: string[] = []
    const Leaf = () => {
      useEffect(() => () => log.push('effect:leaf'), [])
      useLayoutEffect(() => () => log.push('layout:leaf'), [])
      return null
    }
    const Child = () => {
      useEffect(() => () => log.push('effect:child'), [])
      useLayoutEffect(() => () => log.push('layout:child'), [])
      return jsx(Leaf, {})
    }
    const Parent = () => {
      useEffect(() => () => log.push('effect:parent'), [])
      useLayoutEffect(() => () => log.push('layout:parent'), [])
      return jsx(Child, {})
    }
    const el = document.createElement('div')
    const unmount = mount(jsx(Parent, {}), el)
    await flush()
    unmount()
    const effects = log.filter((l) => l.startsWith('effect:'))
    const layouts = log.filter((l) => l.startsWith('layout:'))
    expect(effects).toEqual(['effect:parent', 'effect:child', 'effect:leaf'])
    expect(layouts).toEqual(['layout:parent', 'layout:child', 'layout:leaf'])
  })
})
