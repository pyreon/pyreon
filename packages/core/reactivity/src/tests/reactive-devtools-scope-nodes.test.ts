/**
 * `_rdScopeNodes(scope)`: the reactive nodes created while `scope` was the
 * current scope (#4446 — a component's owned signals / computeds / effects for
 * the devtools inspector). Ids only; pruned ids drop out on read.
 */
import {
  __resetReactiveDevtoolsForTesting,
  _rdScopeNodes,
  computed,
  effect,
  effectScope,
  setCurrentScope,
  signal,
} from '../index'
import { _rdPrune } from '../reactive-devtools'

afterEach(() => {
  setCurrentScope(null)
  __resetReactiveDevtoolsForTesting()
})

describe('_rdScopeNodes', () => {
  it('lists the nodes created inside the scope, in creation order, and nothing created outside', () => {
    const outside = signal(0, { name: 'outside' })
    const scope = effectScope()
    setCurrentScope(scope)
    const a = signal(1, { name: 'a' })
    const twice = computed(() => a() * 2)
    effect(() => {
      twice()
    })
    setCurrentScope(null)
    signal(2, { name: 'after' })
    const owned = _rdScopeNodes(scope)
    expect(owned.map((n) => [n.name, n.kind])).toEqual([
      ['a', 'signal'],
      [owned[1]!.name, 'derived'],
      [owned[2]!.name, 'effect'],
    ])
    expect(owned.some((n) => n.name === 'outside' || n.name === 'after')).toBe(false)
    void outside
  })

  it('drops a pruned node and returns [] for a scope that created nothing', () => {
    const scope = effectScope()
    setCurrentScope(scope)
    signal(1, { name: 'keep' })
    signal(2, { name: 'gone' })
    setCurrentScope(null)
    const [, gone] = _rdScopeNodes(scope)
    _rdPrune(gone!.id)
    expect(_rdScopeNodes(scope).map((n) => n.name)).toEqual(['keep'])
    expect(_rdScopeNodes(effectScope())).toEqual([])
  })
})
