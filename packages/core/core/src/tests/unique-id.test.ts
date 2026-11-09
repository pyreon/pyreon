import { popContext, pushContext } from '../context'
import {
  _IslandIds,
  _nextIslandIdPrefix,
  _requestIdFrame,
  _resetIdCounter,
  createUniqueId,
} from '../unique-id'

describe('createUniqueId — scopes', () => {
  beforeEach(() => _resetIdCounter())

  it('counts from 1 in the default scope and restarts after a reset', () => {
    expect([createUniqueId(), createUniqueId()]).toEqual(['pyreon-1', 'pyreon-2'])
    _resetIdCounter()
    expect(createUniqueId()).toBe('pyreon-1')
  })

  it('a request scope counts on its own, whatever the default scope holds', () => {
    createUniqueId()
    createUniqueId()
    pushContext(_requestIdFrame())
    try {
      expect([createUniqueId(), createUniqueId()]).toEqual(['pyreon-1', 'pyreon-2'])
    } finally {
      popContext()
    }
    // The default scope was not touched by the request scope.
    expect(createUniqueId()).toBe('pyreon-3')
  })

  it('every request frame is a fresh scope', () => {
    const run = () => {
      pushContext(_requestIdFrame())
      try {
        return createUniqueId()
      } finally {
        popContext()
      }
    }
    expect(run()).toBe('pyreon-1')
    expect(run()).toBe('pyreon-1')
  })

  it('island prefixes are handed out in order and nest under the scope they are taken from', () => {
    expect([_nextIslandIdPrefix(), _nextIslandIdPrefix()]).toEqual(['pyreon-i1-', 'pyreon-i2-'])
    // A reset restarts the island ordinals too.
    _resetIdCounter()
    expect(_nextIslandIdPrefix()).toBe('pyreon-i1-')
  })

  it('_IslandIds gives its subtree a namespace of its own, with nested islands nested in it', () => {
    const subtree = _IslandIds({ prefix: 'pyreon-i4-', children: 'x' })
    try {
      expect(subtree).toBe('x')
      expect(createUniqueId()).toBe('pyreon-i4-1')
      expect(createUniqueId()).toBe('pyreon-i4-2')
      expect(_nextIslandIdPrefix()).toBe('pyreon-i4-i1-')
    } finally {
      popContext()
    }
    // Back in the default scope the namespace is gone.
    expect(createUniqueId()).toBe('pyreon-1')
  })

  it('_IslandIds with no children renders nothing', () => {
    try {
      expect(_IslandIds({ prefix: 'pyreon-i5-' })).toBeNull()
    } finally {
      popContext()
    }
  })
})
