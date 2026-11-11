// Today: a small todo app, written once.
//
// This one file is the whole app on three targets:
//   web      examples/native-showcase-web      rendered to HTML, then hydrated
//   iOS      examples/native-showcase-ios      compiled to SwiftUI by PMTC
//   Android  examples/native-showcase-android  compiled to Jetpack Compose by PMTC
//
// It uses only signals and the canonical @pyreon/primitives, so every line
// lowers on both native toolchains (`bun run check` in examples/native-showcase
// reports zero warnings). The system controls, the switch and the text field,
// stay native on each platform. The surfaces, the type and the ember accent
// come from here, in a light and a dark version that follow the system setting.
import { For, Show, useColorMode } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { Field, Inline, Press, Spacer, Stack, Text, Toggle } from '@pyreon/primitives'

type Todo = { id: number; text: string; done: boolean }

export function TodayApp() {
  const mode = useColorMode()
  const todos = signal<Todo[]>([
    { id: 1, text: 'Water the basil', done: false },
    { id: 2, text: 'Book the dentist', done: true },
    { id: 3, text: 'Call Grandma back', done: false },
  ])
  const draft = signal('')
  const left = computed(() => todos().filter((t) => !t.done).length)
  const empty = computed(() => todos().length === 0)

  const add = () => {
    const text = draft().trim()
    if (text.length === 0) return
    const id = todos().reduce((m, t) => (t.id > m ? t.id : m), 0) + 1
    todos.set([...todos(), { id, text, done: false }])
    draft.set('')
  }
  const toggle = (id: number) => {
    todos.set(todos().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  }
  const remove = (id: number) => {
    todos.set(todos().filter((t) => t.id !== id))
  }

  return (
    <Stack gap={4} style={{ padding: '20px 20px 24px' }} data-testid="today-app">
      <Inline align="center">
        <Text
          size="xl"
          weight="bold"
          accessibilityRole="header"
          style={mode() === 'dark' ? { color: '#FFFCF5' } : { color: '#14141C' }}
        >
          Today
        </Text>
        <Spacer />
        <Text
          size="sm"
          weight="medium"
          style={mode() === 'dark' ? { color: '#C9C4B8' } : { color: '#6B6776' }}
          data-testid="today-count"
        >
          {`${left()} left`}
        </Text>
      </Inline>

      <Inline
        gap={2}
        align="center"
        style={
          mode() === 'dark'
            ? { backgroundColor: '#181822', borderRadius: '16px', padding: '6px' }
            : { backgroundColor: '#FFFCF5', borderRadius: '16px', padding: '6px' }
        }
      >
        <Stack style={{ paddingLeft: '8px' }}>
          <Field
            value={draft}
            onChangeText={(t) => draft.set(t)}
            onSubmit={add}
            placeholder="Add a todo"
            style={{ width: '220px', borderWidth: '0px', borderColor: 'rgba(0, 0, 0, 0)', backgroundColor: 'rgba(0, 0, 0, 0)' }}
            data-testid="today-input"
          />
        </Stack>
        <Spacer />
        <Press onPress={add} accessibilityRole="button" data-testid="today-add">
          <Stack
            style={
              mode() === 'dark'
                ? { backgroundColor: '#FF5E1A', borderRadius: '12px' }
                : { backgroundColor: '#A8380A', borderRadius: '12px' }
            }
          >
            <Stack style={{ padding: '10px 18px' }}>
              <Text weight="medium" style={mode() === 'dark' ? { color: '#0A0A0E' } : { color: '#FFFCF5' }}>
                Add
              </Text>
            </Stack>
          </Stack>
        </Press>
      </Inline>

      <Stack gap={2}>
        <For each={todos} by={(t) => t.id}>
          {(t) => (
            <TodoRow todo={t} onToggle={() => toggle(t.id)} onRemove={() => remove(t.id)} />
          )}
        </For>
      </Stack>

      <Show when={empty}>
        <Text style={mode() === 'dark' ? { color: '#C9C4B8' } : { color: '#6B6776' }}>
          All clear. Enjoy the afternoon.
        </Text>
      </Show>
    </Stack>
  )
}

export function TodoRow(props: { todo: Todo; onToggle: () => void; onRemove: () => void }) {
  const mode = useColorMode()
  return (
    <Inline
      gap={3}
      align="center"
      style={
        mode() === 'dark'
          ? { backgroundColor: '#181822', borderRadius: '14px', padding: '12px' }
          : { backgroundColor: '#FFFCF5', borderRadius: '14px', padding: '12px' }
      }
      data-testid={`todo-${props.todo.id}`}
    >
      <Text
        style={
          props.todo.done
            ? mode() === 'dark' ? { color: '#8A8696' } : { color: '#8A8578' }
            : mode() === 'dark' ? { color: '#F4EFE6' } : { color: '#14141C' }
        }
      >
        {props.todo.text}
      </Text>
      <Spacer />
      {/* maxWidth keeps the switch at its own size: a SwiftUI Toggle with no
          label still fills the row, the web and Compose ones do not (#4344). */}
      <Toggle
        value={props.todo.done}
        onChange={props.onToggle}
        accessibilityLabel={props.todo.text}
        style={{ maxWidth: '64px' }}
        data-testid={`todo-${props.todo.id}-done`}
      />
      <Press
        onPress={props.onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${props.todo.text}`}
        data-testid={`todo-${props.todo.id}-remove`}
      >
        <Text size="sm" weight="medium" style={mode() === 'dark' ? { color: '#FF7A3D' } : { color: '#A8380A' }}>
          Remove
        </Text>
      </Press>
    </Inline>
  )
}
