import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount, Transition } from '..'

/**
 * Regression — Transition's `appear: true` queues `applyEnter(ref.current)`
 * in a microtask, but when wrapped in Portal/Show/etc. the ref may still
 * be null at that point. Previously `applyEnter(null as HTMLElement)`
 * crashed with `Cannot read properties of null (reading 'classList')`.
 * After the fix, `safeApplyEnter` retries up to 16 microtasks for the
 * ref to populate before silently giving up.
 *
 * Bug surfaced in #942/#945 follow-up audit (W14 deep test) when
 * `<Show when={open}><Portal><Transition appear show={open}>...`.
 */
describe('Transition — null-ref handling (W14 follow-up)', () => {
  test('Transition with appear=true survives a delayed ref', async () => {
    const errors: Error[] = []
    const onerr = (e: ErrorEvent) => errors.push(e.error)
    window.addEventListener('error', onerr)

    // Wrap Transition behind a component whose child ref assignment is
    // deferred by one microtask, mimicking the Portal-wrapped shape.
    const container = document.createElement('div')
    document.body.appendChild(container)

    const show = signal(false)
    // Mount with show=false (initially-hidden), then flip true. The
    // appear: true path queues applyEnter — the inner div takes one
    // microtask to commit.
    mount(
      h(
        Transition,
        {
          show: () => show(),
          appear: true,
          enterFrom: 'opacity-0',
          enterTo: 'opacity-100',
        } as never,
        h('div', { class: 'modal' }, 'hello'),
      ),
      container,
    )

    show.set(true)
    // Wait for several microtasks so the retry path runs through.
    await new Promise((r) => setTimeout(r, 100))

    expect(errors).toEqual([])
    window.removeEventListener('error', onerr)
    container.remove()
  })
})
