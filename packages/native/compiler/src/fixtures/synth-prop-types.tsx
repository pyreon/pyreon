// Regression fixture for Kotlin synthetic data class emit from inline
// object types in PROP annotations.
//
// Pre-fix the synth-class emit ran AFTER decl-pass but BEFORE prop-
// pass, so prop-discovered synth types were silently dropped from the
// emit. Kotlin emit would reference `MyListItem` in the function
// signature but never declare `data class MyListItem`. kotlinc:
// `unresolved reference 'MyListItem'`.
//
// Surfaced by the Gap 5 tasks-showcase scaffold (#1449) — its
// `TasksListPage(tasks: { id, title, done }[], ...)` prop type
// generated `TasksListPageTask` references that never had a
// declaration. The scaffold's README documented this as limitation
// #1.
//
// Fix moves the synth-class emit AFTER both decl + prop discovery
// passes complete. Swift is unaffected — its inline-object emit
// uses labeled-tuple syntax (`[(id: Int, name: String)]`) which
// needs no separate declaration.

import { Stack, Text, Button, For } from '@pyreon/primitives'

export function MyList(props: {
  items: { id: number; name: string }[]
  onSelect: (id: number) => void
}) {
  return (
    <Stack>
      <Text>Count: {props.items.length}</Text>
      <For each={props.items} by={(it) => it.id}>
        {(it) => (
          <Button onPress={() => props.onSelect(it.id)}>{it.name}</Button>
        )}
      </For>
    </Stack>
  )
}
