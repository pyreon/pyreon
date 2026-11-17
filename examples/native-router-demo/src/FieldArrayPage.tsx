// @ts-nocheck — PMTC handles typing; see RouterApp.tsx.
//
// Forms row (FRM-1): `useFieldArray` rows driven through `<Field>` inputs, not
// a display list. Each keyed row is a text input bound to its own item; the
// `Values` line reads the array back, so typing into a row is visible in the
// form state. Removing the FIRST row must leave the rows below it bound to the
// same items (stable keys): a re-keyed survivor would show another row's text
// or lose what was typed into it.
import { useFieldArray } from '@pyreon/form'
import { For } from '@pyreon/core'
import { Button, Field, Stack, Text } from '@pyreon/primitives'
import { useNavigate } from '@pyreon/router'

export function FieldArrayPage() {
  const navigate = useNavigate()
  const rows = useFieldArray(['alpha', 'beta'])
  return (
    <Stack gap={2} padding={4} data-testid="field-array-page">
      <Text data-testid="fa-values">Values: {rows.values().join(',')}</Text>
      <Text data-testid="fa-count">Rows: {rows.length()}</Text>
      <Button onPress={() => rows.append('')} data-testid="fa-add">Add row</Button>
      <Button onPress={() => rows.remove(0)} data-testid="fa-remove-first">Remove first</Button>
      <Button onPress={() => navigate('/')}>Back to Home</Button>
      <For each={rows.items()} by={(i) => i.key}>
        {(item) => (
          <Field
            value={item.value}
            onChangeText={(t) => item.value.set(t)}
            placeholder="Row"
            data-testid={`fa-row-${item.key}`}
          />
        )}
      </For>
    </Stack>
  )
}
