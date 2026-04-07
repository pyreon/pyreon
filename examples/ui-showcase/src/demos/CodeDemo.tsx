import { Code, Paragraph, Title } from '@pyreon/ui-components'

export function CodeDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Code</Title>

      <Title size="h3" style="margin-bottom: 12px">Inline Code</Title>
      <div style="margin-bottom: 24px;">
        <Paragraph>
          Use <Code variant="inline">signal()</Code> to create reactive state and <Code variant="inline">computed()</Code> for derived values. Call <Code variant="inline">effect()</Code> to run side effects.
        </Paragraph>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Code Block</Title>
      <div style="margin-bottom: 24px;">
        <Code variant="block">{`import { signal, computed } from '@pyreon/reactivity'

const count = signal(0)
const doubled = computed(() => count() * 2)

count.set(5)
console.log(doubled()) // 10`}</Code>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Another Block Example</Title>
      <div style="margin-bottom: 24px;">
        <Code variant="block">{`function Counter() {
  const count = signal(0)
  return <button onClick={() => count.update(n => n + 1)}>
    Count: {count()}
  </button>
}`}</Code>
      </div>
    </div>
  )
}
