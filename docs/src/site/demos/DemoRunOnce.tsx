import { onMount, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { DemoSurface } from '../kit/cards'
import { DemoGrid, DemoPanel, Meters, PaperButton, PaperHint, PaperLabel } from '../kit/demo'
import { Code } from '../kit/type'

/**
 * The run-once counter on `/why/components-run-once`, a zero island on the
 * real `@pyreon/reactivity` and runtime. Every number is measured, not
 * scripted:
 *
 *   - "Counter() body ran" is incremented by the component body itself, so it
 *     reads 1 for the island's lifetime unless the body really runs again;
 *   - "text-node writes" comes from a MutationObserver on the `<output>` that
 *     shows the count: the DOM writes the browser actually saw;
 *   - "elements created after mount" is a MutationObserver on the whole
 *     counter for added nodes (a re-render would add some; a signal write adds none).
 */
function Counter(props: { count: () => number; onBodyRun: () => void; onAdd: () => void; onSub: () => void }) {
  props.onBodyRun()
  return (
    <>
      <PaperLabel>Counter()</PaperLabel>
      <output aria-live="polite" data-run-once-value="">
        {() => props.count()}
      </output>
      <PaperButton type="button" aria-label="Add one" onClick={() => props.onAdd()}>
        +
      </PaperButton>
      <PaperButton type="button" aria-label="Subtract one" onClick={() => props.onSub()}>
        −
      </PaperButton>
    </>
  )
}

export default function DemoRunOnce() {
  const count = signal(0)
  const bodyRuns = signal(0)
  const writes = signal(0)
  const added = signal(0)
  let root: HTMLElement | null = null
  let observer: MutationObserver | null = null

  onMount(() => {
    const out = root?.querySelector('[data-run-once-value]')
    if (!root || !out || typeof MutationObserver === 'undefined') return
    observer = new MutationObserver((records) => {
      let w = 0
      let a = 0
      for (const r of records) {
        if (r.type === 'characterData' || (r.type === 'childList' && r.target === out)) w++
        else if (r.type === 'childList') for (const n of r.addedNodes) if (n.nodeType === 1) a++
      }
      if (w) writes.update((n) => n + w)
      if (a) added.update((n) => n + a)
    })
    observer.observe(root, { subtree: true, childList: true, characterData: true })
  })
  onUnmount(() => observer?.disconnect())

  return (
    <DemoGrid>
      <DemoPanel note="Measured in this page: a counter in the component body, and a MutationObserver on the DOM.">
        <Meters
          label="What a click does"
          items={[
            { label: 'count', value: () => count() },
            { label: 'Counter() body ran', value: () => bodyRuns() },
            { label: 'text-node writes', value: () => writes() },
            { label: 'elements created after mount', value: () => added() },
          ]}
        />
      </DemoPanel>
      <div
        ref={(n: HTMLElement | null) => {
          root = n
        }}
      >
        <DemoSurface aria-label="A live counter">
          <Counter
            count={() => count()}
            onBodyRun={() => bodyRuns.update((n) => n + 1)}
            onAdd={() => count.update((n) => n + 1)}
            onSub={() => count.update((n) => n - 1)}
          />
          <PaperHint>
            <Code>count.update(n =&gt; n + 1)</Code> writes one text node. The body above ran once.
          </PaperHint>
        </DemoSurface>
      </div>
    </DemoGrid>
  )
}
