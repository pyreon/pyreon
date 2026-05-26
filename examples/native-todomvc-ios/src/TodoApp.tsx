// PMTC TodoMVC reference — the canonical "non-trivial but not contrived"
// app, used by every UI framework as a baseline.
//
// This file is the SOURCE — what `pyreon-native build` consumes. The
// generated Swift / Kotlin lands in `generated/`.
//
// Uses canonical @pyreon/primitives vocabulary:
// - `<Stack>` / `<Inline>` (was `<VStack>` / `<HStack>`)
// - `<Field value onChangeText onSubmit>` (was `<TextField value onInput onKeyDown>`)
// - `<Button onPress>` (was `<Button onClick>`)
// - `<Toggle value onChange>` (was `<Checkbox checked onChange>`) — non-signal
//   value path (PR #970) routes through SwiftUI `Binding(get:set:)` for the
//   parent-owns-state pattern used by TodoRow.

import { signal, computed } from '@pyreon/reactivity'
// `@pyreon/storage` — cross-platform persistence (Phase 0+: still
// uses localStorage on web; Phase 1+ adds @pyreon/storage-ios /
// @pyreon/storage-android per the platform-abstractions spec).
import { useStorage } from '@pyreon/storage'

type Todo = { id: number; text: string; done: boolean }
type Filter = 'all' | 'active' | 'completed'

let nextId = 1

export function TodoApp() {
  const todos = useStorage<Todo[]>('pyreon-todomvc:todos', [])
  const filter = signal<Filter>('all')
  const draft = signal<string>('')

  const visible = computed(() => {
    const xs = todos()
    if (filter() === 'active') return xs.filter(t => !t.done)
    if (filter() === 'completed') return xs.filter(t => t.done)
    return xs
  })

  const remaining = computed(() => todos().filter(t => !t.done).length)
  const hasCompleted = computed(() => todos().some(t => t.done))

  const addTodo = () => {
    const text = draft().trim()
    if (text.length === 0) return
    todos.set([...todos(), { id: nextId++, text, done: false }])
    draft.set('')
  }

  const toggle = (id: number) => {
    todos.set(todos().map(t => t.id === id ? { ...t, done: !t.done } : t))
  }

  const remove = (id: number) => {
    todos.set(todos().filter(t => t.id !== id))
  }

  const clearCompleted = () => {
    todos.set(todos().filter(t => !t.done))
  }

  return (
    <Stack>
      <Field
        value={draft}
        onChangeText={(t) => draft.set(t)}
        onSubmit={addTodo}
        placeholder="What needs to be done?"
      />

      <For each={visible} by={(t) => t.id}>
        {(t) => (
          <TodoRow
            todo={t}
            onToggle={() => toggle(t.id)}
            onRemove={() => remove(t.id)}
          />
        )}
      </For>

      <Inline>
        <Text>{remaining} remaining</Text>
        <Button onPress={() => filter.set('all')}>All</Button>
        <Button onPress={() => filter.set('active')}>Active</Button>
        <Button onPress={() => filter.set('completed')}>Completed</Button>
        <Show when={hasCompleted}>
          <Button onPress={clearCompleted}>Clear completed</Button>
        </Show>
      </Inline>
    </Stack>
  )
}

export function TodoRow(props: { todo: Todo; onToggle: () => void; onRemove: () => void }) {
  return (
    <Inline>
      <Toggle value={props.todo.done} onChange={props.onToggle} />
      <Text>{props.todo.text}</Text>
      <Button onPress={props.onRemove}>Remove</Button>
    </Inline>
  )
}
