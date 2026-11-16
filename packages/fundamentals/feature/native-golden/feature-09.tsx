import { defineFeature } from '@pyreon/feature'
import { Button, Stack, Text } from '@pyreon/primitives'

// The CRUD hooks lower onto @pyreon/query's native containers against an absolute `api`; the three mutations warn by
// design (no shared query client invalidates the queries natively), and `useSearch` is named, not emitted.
export const Todo = defineFeature({
  name: 'todo',
  schema: { id: 'string', title: 'string', done: 'boolean' },
  api: 'https://api.example.com/todos',
})

export function Todos(props: { id: string }) {
  const list = Todo.useList({ staleTime: 1000 })
  const one = Todo.useById(() => props.id)
  const create = Todo.useCreate()
  const update = Todo.useUpdate()
  const remove = Todo.useDelete()
  return (
    <Stack>
      <Text>{'Count: ' + (list.data()?.length ?? 0)}</Text>
      <Text>{one.data()?.title ?? ''}</Text>
      <Button onPress={() => create.mutate({ title: 'New', done: false })}>Add</Button>
      <Button onPress={() => update.mutate({ id: props.id, data: { done: true } })}>Done</Button>
      <Button onPress={() => remove.mutate(props.id)}>Delete</Button>
    </Stack>
  )
}
