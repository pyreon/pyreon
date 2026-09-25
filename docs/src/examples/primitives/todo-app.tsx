import { For } from '@pyreon/core'
import { Button, Field, Inline, Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'

/**
 * The live counterpart to the "Quick start" snippet on the
 * `@pyreon/primitives` docs page — the exact same component, mounted for
 * real. On THIS page (web) `<Stack>` / `<Inline>` / `<Text>` / `<Field>` /
 * `<Button>` resolve to their `src/web/` implementations (a `<div>`, a
 * `<span>`, an `<input>`, a `<button>`); on an iOS/Android build, PMTC
 * intercepts this same JSX at compile time and emits SwiftUI/Compose
 * instead — the import is a type-anchor there, never invoked.
 */
export default function TodoApp() {
  const draft = signal('')
  const todos = signal<string[]>([])

  return (
    <Stack gap="md" padding="md">
      <Text size="lg" weight="bold">Todos</Text>
      <Field
        value={() => draft()}
        onChangeText={(t) => draft.set(t)}
        onSubmit={() => {
          if (draft().trim() === '') return
          todos.update((xs) => [...xs, draft()])
          draft.set('')
        }}
        placeholder="Add..."
      />
      <Inline gap="sm" align="center">
        <Text>Total: {() => todos().length}</Text>
        <Button
          variant="primary"
          onPress={() => {
            todos.update((xs) => [...xs, draft()])
            draft.set('')
          }}
        >
          Add
        </Button>
        <Button
          variant="ghost"
          onPress={() => todos.set([])}
        >
          Clear
        </Button>
      </Inline>
      <Stack gap="xs">
        <For each={() => todos().map((t, i) => ({ t, i }))} by={(x) => x.i}>
          {(x) => <Text>• {x.t}</Text>}
        </For>
      </Stack>
    </Stack>
  )
}
