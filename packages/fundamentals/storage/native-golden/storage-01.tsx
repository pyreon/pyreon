import { useStorage } from '@pyreon/storage'
import { Stack, Text, Button, For } from '@pyreon/primitives'

type Filter = 'all' | 'active' | 'done'
type Todo = { id: number; title: string; done: boolean }
type Settings = { theme: string; size: number }

const KEY = 'persisted-count'

export function Native() {
  const name = useStorage<string>('name', 'anon')
  const count = useStorage<number>('count', 0)
  const ratio = useStorage<number>('ratio', 0.5)
  const dark = useStorage<boolean>('dark', false)
  const filter = useStorage<Filter>('filter', 'all')
  const nick = useStorage<string | null>('nick', null)
  const inferred = useStorage('inferred', 'x')
  const keyed = useStorage<number>(KEY, 1)
  const noInitial = useStorage<number>('no-initial')
  return (
    <Stack>
      <Text>{name()}</Text>
      <Text>{`${count()} ${ratio()}`}</Text>
      <Text>{dark() ? 'dark' : 'light'}</Text>
      <Text>{filter()}</Text>
      <Text>{nick() ?? 'none'}</Text>
      <Text>{inferred()}</Text>
      <Text>{keyed()}</Text>
      <Text>{noInitial()}</Text>
      <Button onPress={() => count.set(count() + 1)}>inc</Button>
      <Button onPress={() => dark.set(!dark())}>toggle</Button>
      <Button onPress={() => filter.set('done')}>done</Button>
    </Stack>
  )
}

export function Structured() {
  const todos = useStorage<Todo[]>('todos', [])
  const seeded = useStorage<Todo[]>('seeded', [{ id: 1, title: 'a', done: false }])
  const settings = useStorage<Settings>('settings', { theme: 'light', size: 12 })
  const ids = useStorage<number[]>('ids', [1, 2])
  return (
    <Stack>
      <For each={todos()} by={(t) => t.id}>{(t) => <Text>{t.title}</Text>}</For>
      <Text>{seeded().length}</Text>
      <Text>{settings().theme}</Text>
      <Text>{ids().length}</Text>
      <Button onPress={() => todos.set([...todos(), { id: todos().length, title: 'n', done: false }])}>add</Button>
    </Stack>
  )
}
