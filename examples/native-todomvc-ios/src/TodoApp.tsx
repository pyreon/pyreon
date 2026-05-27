// @ts-nocheck — PMTC handles typing; tsc errors are noise.
//
// The bare `<Text>{count} text</Text>` multi-child shape (canonical
// Pyreon-runtime pattern) trips a TS variance limitation: each multi-
// child slot is typed against `VNodeChildAtom`, and a `Computed<T>` is
// `(): T` + extra props, which fails the strict overload assignment.
// The web Vite build doesn't care (Vite/esbuild don't typecheck);
// only `tsc --noEmit` does. Native targets typecheck via PMTC, not tsc.
// `@ts-nocheck` keeps the source readable + cross-target clean.
//
// PMTC TodoMVC reference — the SINGLE source for web, iOS, and Android.
//
// Phase E3 acceptance criterion: a developer reads
// `examples/native-todomvc-{web,ios,android}/src/TodoApp.tsx` and SEES
// that it's the same file path. The web sibling's `entry-client.tsx`
// imports from this iOS path; iOS reads it as-is; Android's build script
// reads it. ONE file, THREE targets.
//
// Uses canonical @pyreon/primitives vocabulary (auto-imported on web
// via @pyreon/vite-plugin's jsxAutoImport pass; on native the PMTC
// compiler resolves bare tags via its canonical-primitives table —
// imports would be no-ops, so iOS source keeps the import surface
// minimal):
//
//   <Stack> / <Inline>          (was <VStack> / <HStack>)
//   <Field value onChangeText>  (was <TextField value onInput>)
//   <Button onPress>            (was <Button onClick>)
//   <Toggle value onChange>     (was <Checkbox checked onChange>)
//
// `gap` / `align` props resolve per-target via the canonical-primitives
// table (web: flex CSS; SwiftUI: spacing arg + alignment; Compose:
// Arrangement.spacedBy + alignment). `data-testid` becomes
// `.accessibilityIdentifier()` on SwiftUI and `Modifier.testTag()` on
// Compose — the same string the web e2e selects on (`getByTestId`)
// reaches XCUITest + Espresso. The compiler handles the translation
// silently for any data-* attr (E3.1).

import { signal, computed } from '@pyreon/reactivity'
// `@pyreon/storage` — cross-platform persistence (Phase 0+: still
// uses localStorage on web; Phase 1+ adds @pyreon/storage-ios /
// @pyreon/storage-android per the platform-abstractions spec).
import { useStorage } from '@pyreon/storage'
// Canonical primitives — type-only on native (PMTC resolves bare
// JSX tags via its canonical-primitives table at compile time),
// real values on web (the imported components ARE the DOM renderers).
// Same .tsx file works on all three targets.
import { For, Show } from '@pyreon/core'
import { Stack, Inline, Text, Button, Field, Toggle } from '@pyreon/primitives'

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
    <Inline gap={2} align="center">
      <Toggle value={props.todo.done} onChange={props.onToggle} />
      <Text>{props.todo.text}</Text>
      <Button onPress={props.onRemove}>Remove</Button>
    </Inline>
  )
}
