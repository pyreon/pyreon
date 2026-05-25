// PMTC TodoMVC reference — WEB target.
//
// Sibling of ../../native-todomvc-ios/src/TodoApp.tsx (SwiftUI) and
// ../../native-todomvc-android/* (Compose). Phase D of the PMTC
// multiplatform story.
//
// ## Why a separate file vs the SAME tsx as native?
//
// The canonical primitive vocabulary (Stack, Inline, Field, Button,
// Press, Text — from @pyreon/primitives) needs to be in LEXICAL SCOPE
// for the web TypeScript build (JSX bare references compile to `h(Stack,
// ...)` which needs the symbol resolvable). The PMTC native compiler
// resolves bare JSX tags via its canonical-primitives table at compile
// time + emits SwiftUI/Kotlin directly, so the imports are unnecessary
// (and would be no-ops if added — the native compiler treats them as
// type-only). The native source kept zero @pyreon/primitives imports
// to keep its surface minimal.
//
// **The "literally same .tsx file" claim is a Phase D2 follow-up** —
// it requires a `@pyreon/vite-plugin` JSX-auto-import pass that injects
// `import { Stack, ... } from '@pyreon/primitives'` for every bare
// canonical-tag reference. Until that ships, web has its own near-
// identical copy with the imports added.
//
// ## What this proves
//
// `@pyreon/primitives`' 6 implemented web primitives (Stack, Inline,
// Text, Button, Press, Field) plus Pyreon's For/Show control flow
// render a non-trivial app (TodoMVC) end-to-end with reactive
// signals + persistent storage. The verify-modes cell asserts the
// build emits content; a real-Chromium e2e gate is a follow-up.

import { signal, computed } from '@pyreon/reactivity'
import { useStorage } from '@pyreon/storage'
import { For, Show } from '@pyreon/core'
import { Stack, Inline, Text, Button, Field } from '@pyreon/primitives'
import { Checkbox } from './shims/Checkbox'

type Todo = { id: number; text: string; done: boolean }
type Filter = 'all' | 'active' | 'completed'

let nextId = 1

export function TodoApp() {
  const todos = useStorage<Todo[]>('pyreon-todomvc:todos', [])
  const filter = signal<Filter>('all')
  const draft = signal<string>('')

  const visible = computed(() => {
    const xs = todos()
    if (filter() === 'active') return xs.filter((t) => !t.done)
    if (filter() === 'completed') return xs.filter((t) => t.done)
    return xs
  })

  const remaining = computed(() => todos().filter((t) => !t.done).length)
  const hasCompleted = computed(() => todos().some((t) => t.done))

  const addTodo = () => {
    const text = draft().trim()
    if (text.length === 0) return
    todos.set([...todos(), { id: nextId++, text, done: false }])
    draft.set('')
  }

  const toggle = (id: number) => {
    todos.set(todos().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  }

  const remove = (id: number) => {
    todos.set(todos().filter((t) => t.id !== id))
  }

  const clearCompleted = () => {
    todos.set(todos().filter((t) => !t.done))
  }

  return (
    <Stack gap={2} data-testid="todo-app">
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

      <Inline gap={2} align="center">
        <Text>{() => `${remaining()} remaining`}</Text>
        <Button onPress={() => filter.set('all')}>All</Button>
        <Button onPress={() => filter.set('active')}>Active</Button>
        <Button onPress={() => filter.set('completed')}>Completed</Button>
        <Show when={() => hasCompleted()}>
          <Button onPress={clearCompleted}>Clear completed</Button>
        </Show>
      </Inline>
    </Stack>
  )
}

function TodoRow(props: {
  todo: Todo
  onToggle: () => void
  onRemove: () => void
}) {
  return (
    <Inline gap={2} align="center">
      <Checkbox checked={props.todo.done} onChange={props.onToggle} />
      <Text>{props.todo.text}</Text>
      <Button onPress={props.onRemove}>Remove</Button>
    </Inline>
  )
}
