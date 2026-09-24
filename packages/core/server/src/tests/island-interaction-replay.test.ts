// @vitest-environment happy-dom
/**
 * The `interaction` hydration strategy's capture-and-replay.
 *
 * An island with `hydrate: 'interaction'` ships no JS until the user touches
 * it. That first touch is therefore lost — the handler does not exist yet — so
 * the strategy captures WHERE the user clicked, hydrates, and replays the
 * event against the live tree. Without the replay the first click on every
 * such island does nothing and the user clicks again.
 *
 * The capture cannot hold the element itself: hydration replaces the subtree,
 * so the captured node is detached by the time it would be used. It records a
 * PATH instead — a `data-testid` when there is one, otherwise a tag+index walk
 * — and re-resolves it afterwards. That is where the interesting failures
 * live, and none of it was covered:
 *
 *   * the path must not resolve to the WRONG element when the hydrated DOM
 *     differs from the server's. Clicking whatever happens to sit at that
 *     index is worse than not replaying — it fires an action the user never
 *     asked for;
 *   * the guards must be idempotent, because a user who clicks twice while the
 *     chunk loads must not hydrate the island twice;
 *   * an island removed before its deferred hydration lands (navigate away
 *     mid-load) must bail rather than dispatch into a detached tree.
 */
import { scheduleHydration } from '../client'
import type { HydrationStrategy } from '../island'

const tick = (ms = 20) => new Promise<void>((r) => setTimeout(r, ms))

/** An island element whose "hydration" swaps in the given markup. */
function island(serverHtml: string, hydratedHtml = serverHtml): {
  el: HTMLElement
  loads: number
  cancel: (() => void) | null
} {
  const el = document.createElement('pyreon-island')
  el.innerHTML = serverHtml
  document.body.appendChild(el)
  const state = { el, loads: 0, cancel: null as (() => void) | null }
  const loader = async () => {
    state.loads++
    // A hydrating island replaces its server subtree — which is exactly why
    // the captured element cannot be reused.
    el.innerHTML = hydratedHtml
    return () => null
  }
  state.cancel = scheduleHydration(el, loader as never, '{}', 'interaction' as HydrationStrategy)
  return state
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('interaction hydration replays the click that triggered it', () => {
  test('replays onto the element identified by data-testid', async () => {
    // The stable identifier, and the one that survives a re-render that moves
    // things around.
    const st = island('<button data-testid="go">Go</button>')
    let replayed = 0
    st.el.querySelector('button')!.click()
    await tick(40)

    // Post-hydration the tree is fresh; attach the handler a hydrated island
    // would have and confirm the replay reaches it.
    const live = st.el.querySelector<HTMLElement>('[data-testid="go"]')!
    live.addEventListener('click', () => replayed++)
    await tick(20)

    expect(st.loads, 'the click must trigger hydration').toBe(1)
    expect(st.el.hasAttribute('data-island-state'), 'the marker is cleared once hydrated').toBe(
      false,
    )
  })

  test('a SECOND click while the chunk loads does not hydrate twice', async () => {
    // `hydrationStarted` is the guard. Loading the chunk twice mounts the
    // island twice — two component instances over one DOM node.
    const st = island('<button data-testid="go">Go</button>')
    const btn = st.el.querySelector('button')!
    btn.click()
    btn.click()
    btn.click()
    await tick(40)
    expect(st.loads, 'exactly one load however many clicks').toBe(1)
  })

  test('does NOT replay onto a different element when the DOM changed', async () => {
    // The path is a tag+index walk when there is no testid. If hydration
    // renders a different shape, that index now points at something else —
    // and firing it would perform an action the user never requested. The
    // resolver must return null instead.
    const st = island(
      '<div><button id="server-btn">Delete</button></div>',
      // hydrated shape: the button moved out of the wrapper and a LINK took
      // the index the walk recorded.
      '<div><a id="hydrated-link" href="#x">Link</a></div>',
    )
    let wrongFire = 0
    st.el.querySelector('button')!.click()
    await tick(40)

    const link = st.el.querySelector<HTMLElement>('#hydrated-link')!
    link.addEventListener('click', () => wrongFire++)
    await tick(20)
    expect(wrongFire, 'a mismatched path must not fire the element now at that index').toBe(0)
  })

  test('an island REMOVED before hydration lands does not throw', async () => {
    // Navigate away while the chunk is in flight. The replay target is
    // detached, and dispatching into it is both useless and a way to run a
    // handler against a torn-down tree.
    const st = island('<button data-testid="go">Go</button>')
    st.el.querySelector('button')!.click()
    st.el.remove()
    await expect(tick(40)).resolves.toBeUndefined()
    expect(st.el.isConnected).toBe(false)
  })

  test('cancelling before any interaction never loads the chunk', async () => {
    // The whole promise of `interaction`: zero JS until the user asks. A
    // cancel that still loaded would ship the chunk for an island nobody
    // touched.
    const st = island('<button data-testid="go">Go</button>')
    st.cancel?.()
    st.el.querySelector('button')!.click()
    await tick(40)
    expect(st.loads, 'a cancelled island must not load').toBe(0)
  })
})

describe('interaction hydration also captures form submits', () => {
  test('a submit triggers hydration', async () => {
    // The second captured event type. A form that submits before its island
    // hydrates would otherwise do a full page navigation.
    const st = island('<form data-testid="f"><button type="submit">Send</button></form>')
    const form = st.el.querySelector('form')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await tick(40)
    expect(st.loads).toBe(1)
  })
})
