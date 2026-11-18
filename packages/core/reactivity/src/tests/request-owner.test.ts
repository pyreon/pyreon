import {
  _setRequestOwnerReader,
  computed,
  effect,
  effectScope,
  getCurrentScope,
  renderEffect,
  signal,
} from '../index'

/**
 * `_setRequestOwnerReader` is how a server renderer owns the nodes a component
 * creates during SSR (no component scope exists there). It is consulted only
 * when a node registers with no current scope, and never changes what
 * `getCurrentScope()` reports.
 */
describe('request owner reader', () => {
  afterEach(() => _setRequestOwnerReader(null))

  test('ownerless effect / computed / renderEffect register with the request scope', () => {
    const request = effectScope()
    _setRequestOwnerReader(() => request)
    const g = signal(0)
    effect(() => {
      g()
    })
    const c = computed(() => g() + 1)
    c()
    renderEffect(() => {
      g()
    })
    expect(g.debug().subscriberCount).toBe(3)
    expect(getCurrentScope()).toBeNull()
    request.stop()
    expect(g.debug().subscriberCount).toBe(0)
  })

  test('a current scope wins over the request owner', () => {
    const request = effectScope()
    const own = effectScope()
    let reads = 0
    _setRequestOwnerReader(() => {
      reads++
      return request
    })
    const g = signal(0)
    own.runInScope(() => {
      effect(() => {
        g()
      })
    })
    expect(reads).toBe(0)
    request.stop()
    expect(g.debug().subscriberCount).toBe(1)
    own.stop()
    expect(g.debug().subscriberCount).toBe(0)
  })

  test('no request in the current context leaves the node ownerless', () => {
    _setRequestOwnerReader(() => undefined)
    const g = signal(0)
    const e = effect(() => {
      g()
    })
    expect(g.debug().subscriberCount).toBe(1)
    e.dispose()
  })
})
