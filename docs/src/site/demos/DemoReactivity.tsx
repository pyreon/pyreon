import { batch, computed, effect, signal } from '@pyreon/reactivity'
import { DemoSurface } from '../kit/cards'
import { DemoGrid, DemoPanel, Meters, PaperButton, PaperHint, PaperLabel } from '../kit/demo'
import { Code } from '../kit/type'

/**
 * Reactivity demo (`reactivity.json` → demo): two real signals, one
 * computed, one effect, all from `@pyreon/reactivity`. The counters are the
 * actual run counts: the computed counts its own evaluations, the effect its
 * own runs. `batch()` folds two writes into one effect run, and writing the
 * same value re-runs nothing (`Object.is`).
 */
export default function DemoReactivity() {
  const price = signal(100)
  const qty = signal(2)
  const writes = { price: signal(0), qty: signal(0) }
  const computedRuns = signal(0)
  const effectRuns = signal(0)
  const log = signal('')

  const total = computed(() => {
    computedRuns.update((n) => n + 1)
    return price() * qty()
  })

  // A real effect, created at setup like any other; it counts its own runs.
  effect(() => {
    total()
    effectRuns.update((n) => n + 1)
  })

  const run = (label: string, fn: () => void) => {
    const c0 = computedRuns.peek()
    const e0 = effectRuns.peek()
    fn()
    // Effects flush after the write settles; read the counts once they have.
    void Promise.resolve().then(() => {
      const c = computedRuns.peek() - c0
      const e = effectRuns.peek() - e0
      log.set(c === 0 && e === 0 ? `${label} → nothing re-ran` : `${label} → computed ${c}×, effect ${e}×`)
    })
  }

  return (
    <DemoGrid>
      <DemoPanel note="Numbers count writes and runs. They are read from the signals themselves.">
        <Meters
          label="Writes and runs"
          items={[
            { label: <>price = signal({() => price()})</>, value: () => writes.price() },
            { label: <>qty = signal({() => qty()})</>, value: () => writes.qty() },
            { label: <>total = computed · {() => total()}</>, value: () => computedRuns() },
            { label: 'effect runs', value: () => effectRuns() },
          ]}
        />
      </DemoPanel>
      <DemoSurface>
        <PaperLabel>Actions</PaperLabel>
        <PaperButton
          type="button"
          onClick={() =>
            run('1 write', () => {
              writes.price.update((n) => n + 1)
              price.set(price.peek() + 10)
            })
          }
        >
          <Code>price.set(price() + 10)</Code>
        </PaperButton>
        <PaperButton
          type="button"
          onClick={() =>
            run('1 write', () => {
              writes.qty.update((n) => n + 1)
              qty.update((n) => n + 1)
            })
          }
        >
          <Code>qty.update(n =&gt; n + 1)</Code>
        </PaperButton>
        <PaperButton
          type="button"
          onClick={() =>
            run('2 writes in batch()', () =>
              batch(() => {
                writes.price.update((n) => n + 1)
                writes.qty.update((n) => n + 1)
                price.set(price.peek() + 10)
                qty.update((n) => n + 1)
              }),
            )
          }
        >
          <Code>batch: both at once</Code>
        </PaperButton>
        <PaperButton
          type="button"
          onClick={() =>
            run('same value', () => {
              writes.price.update((n) => n + 1)
              price.set(price.peek())
            })
          }
        >
          <Code>price.set(same value)</Code>
        </PaperButton>
        <PaperHint aria-live="polite">{() => log()}</PaperHint>
      </DemoSurface>
    </DemoGrid>
  )
}
