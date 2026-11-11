import { onMount, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

/**
 * The docs home's live counter (`_docs-home.json#whyFast.live`): the same
 * component as the code next to it, mounted for real with
 * `@pyreon/reactivity`. Both numbers under it are measured, not scripted:
 *
 *   - "component runs" counts executions of this function body: it runs once.
 *   - "DOM writes" is what a MutationObserver sees on the button's text: one
 *     write per click, on that one text node.
 */
export default function RunOnceCounter() {
  let bodyRuns = 0
  bodyRuns += 1
  const count = signal(0)
  const writes = signal(0)
  const pulse = signal(false)
  let label: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  onMount(() => {
    if (!label || typeof MutationObserver === 'undefined') return undefined
    const mo = new MutationObserver((records) => {
      writes.update((n) => n + records.length)
      pulse.set(true)
      clearTimeout(timer)
      timer = setTimeout(() => pulse.set(false), 200)
    })
    mo.observe(label, { characterData: true, childList: true, subtree: true })
    return () => mo.disconnect()
  })
  onUnmount(() => clearTimeout(timer))

  return (
    <div class="dx-counter">
      <div class="dx-counter__row">
        <button type="button" class="dx-counter__btn" onClick={() => count.update((n) => n + 1)}>
          <span class="dx-counter__label">count</span>
          <span
            class={() => (pulse() ? 'dx-counter__value dx-counter__value--pulse' : 'dx-counter__value')}
            ref={(el: HTMLElement | null) => {
              label = el
            }}
          >
            {count}
          </span>
        </button>
        <span class="dx-counter__hint">Click it. Watch the numbers on the right.</span>
      </div>
      <dl class="dx-counter__metrics">
        <div>
          <dt>component runs</dt>
          <dd>{bodyRuns}</dd>
        </div>
        <div>
          <dt>DOM writes</dt>
          <dd class="dx-counter__live" aria-live="polite">
            {writes}
          </dd>
        </div>
      </dl>
    </div>
  )
}
