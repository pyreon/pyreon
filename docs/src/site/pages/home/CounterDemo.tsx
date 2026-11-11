import { For, onMount, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { C } from '../../kit/classes'

export interface CounterMetric {
  label: string
  /** The value the server shows. */
  value: string
  /** True for the metric the demo measures live (text node writes). */
  live: boolean
}

/**
 * The homepage's "components run once" counter, an island on the real
 * `@pyreon/reactivity` + `@pyreon/core` (`_home.json` → `once.counter`).
 *
 * Nothing here is simulated. `component runs` counts the times the
 * `Counter` function body executes (it stays 1). `text node writes` counts
 * the DOM mutations a MutationObserver sees on the number's text node, so it
 * is the browser reporting what Pyreon wrote. `nodes diffed` has no counter
 * because there is no diffing; it shows the content's value. The number
 * pulses on each write (brand signal pulse; a static underline under reduced
 * motion).
 */
export default function CounterDemo(props: { metrics: CounterMetric[] }) {
  const runs = signal(0)
  const writes = signal(0)
  const pulse = signal<'' | 'a' | 'b'>('')
  let observer: MutationObserver | null = null
  let output: HTMLElement | null = null

  function Counter() {
    runs.update((n) => n + 1)
    const count = signal(0)
    return (
      <div class={C.counterControls}>
        <button type="button" class={C.counterButton} aria-label="Decrement" onClick={() => count.update((n) => n - 1)}>
          −
        </button>
        <output
          class={C.counterValue}
          aria-live="polite"
          ref={(el: HTMLElement | null) => {
            output = el
          }}
        >
          {count()}
        </output>
        <button type="button" class={C.counterButton} aria-label="Increment" onClick={() => count.update((n) => n + 1)}>
          +
        </button>
      </div>
    )
  }

  onMount(() => {
    output?.closest(`.${C.counter}`)?.setAttribute('data-hydrated', '')
    if (output === null) return undefined
    observer = new MutationObserver((records) => {
      writes.update((n) => n + records.length)
      // Alternate two identical animations so each write restarts the pulse.
      pulse.set(pulse.peek() === 'a' ? 'b' : 'a')
    })
    observer.observe(output, { characterData: true, childList: true, subtree: true })
    return undefined
  })
  onUnmount(() => observer?.disconnect())

  const valueOf = (m: CounterMetric) => {
    if (!m.live) return m.label === 'component runs' ? () => String(runs()) : () => m.value
    return () => String(writes())
  }

  return (
    <div class={C.counter}>
      <Counter />
      <ul class={C.counterMetrics}>
        <For each={props.metrics} by={(m) => m.label}>
          {(m) => (
            <li class={C.counterMetric}>
              <span class={C.counterLabel}>{m.label}</span>
              <b
                class={() => {
                  const live = m.live ? ` ${C.counterLive}` : ''
                  const p = m.live && pulse() !== '' ? ` ${pulse() === 'a' ? C.pulseA : C.pulseB}` : ''
                  return `${C.counterNumber}${live}${p}`
                }}
              >
                {valueOf(m)}
              </b>
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}
