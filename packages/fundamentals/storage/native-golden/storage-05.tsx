import { useStorage } from '@pyreon/storage'
import { Stack, Text, For } from '@pyreon/primitives'

type Todo = { id: number; title: string }

export function EmptyLists() {
  const cast = useStorage<Todo[]>('cast', [] as Todo[])
  const names = useStorage<string[]>('names', [])
  const grid = useStorage<number[][]>('grid', [])
  const maybe = useStorage<Todo | null>('maybe', null)
  return (
    <Stack>
      <For each={cast()} by={(t) => t.id}>{(t) => <Text>{t.title}</Text>}</For>
      <Text>{names().length}</Text>
      <Text>{grid().length}</Text>
      <Text>{maybe()?.title ?? 'none'}</Text>
    </Stack>
  )
}
