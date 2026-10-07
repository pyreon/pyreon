import { useFieldArray } from '@pyreon/form'
import { Stack, Text, For } from '@pyreon/primitives'
export function App() {
  const tags = useFieldArray(['alpha', 'beta'])
  const empty = useFieldArray()
  return <Stack><Text>{tags.length()}</Text>
    <For each={tags.items()} by={(i) => i.key}>{(item) => <Stack>
      <Text>{item.value()}</Text>
      <For each={empty.items} by={(i) => i.key}>{(inner) => <Text>{inner.value()}</Text>}</For>
      <Text>{item.value()}</Text>
    </Stack>}</For>
    <For each={tags.items} by={(i) => i.key}>{(row) => <Text>{row.value()}</Text>}</For>
  </Stack>
}
