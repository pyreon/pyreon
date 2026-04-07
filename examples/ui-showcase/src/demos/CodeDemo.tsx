import { Code, Paragraph } from '@pyreon/ui-components'

export function CodeDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Code</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Inline Code</h3>
      <div style="margin-bottom: 24px;">
        <Paragraph>
          Use <Code variant="inline">signal()</Code> to create reactive state and <Code variant="inline">computed()</Code> for derived values. Call <Code variant="inline">effect()</Code> to run side effects.
        </Paragraph>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Code Block</h3>
      <div style="margin-bottom: 24px;">
        <Code variant="block">{`import { signal, computed } from '@pyreon/reactivity'

const count = signal(0)
const doubled = computed(() => count() * 2)

count.set(5)
console.log(doubled()) // 10`}</Code>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Another Block Example</h3>
      <div style="margin-bottom: 24px;">
        <Code variant="block">{`function Counter() {
  const count = signal(0)
  return <button onClick={() => count.update(n => n + 1)}>
    Count: {() => String(count())}
  </button>
}`}</Code>
      </div>
    </div>
  )
}
