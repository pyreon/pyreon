// Form-binding fixture for @pyreon/form (the v2 form-binding arc).
// The FIRST kotlinc/swiftc validation of ANY useForm shape (no form
// fixture existed before — same gap class the permissions fixture
// closed).
//
// Verified scope:
//   - useForm({ initialValues, validators, onSubmit }) → PyreonForm
//     init with validator closures ("" = valid) + the onSubmit callback
//   - <Field value={form.values.username}> → runtime binding
//     (Swift `form.binding("username")` / Compose value+onValueChange
//     pair routing through setValue → re-validation)
//   - Per-field dict access: `form.errors.username` → subscript with
//     the type-appropriate default (illegal member access pre-arc)
//   - `form.submit()` / `form.setFieldValue(...)` — web-parity API on
//     the runtime ports
//   - `disabled={form.isSubmitting}` scalar reads
//
// Deferred (documented follow-ups):
//   - Block-body validators; async validators; schema validation
//     (@pyreon/validation reachability)
//   - <Form> / <Submit> wrapper components

import { useForm } from '@pyreon/form'
import { Stack, Field, Button, Text } from '@pyreon/primitives'
import { Show } from '@pyreon/core'

export function SignIn() {
  const form = useForm({
    initialValues: { username: '' },
    validators: {
      username: (v) => (v.length < 3 ? 'At least 3 characters' : ''),
    },
    onSubmit: (values) => {
      // The fixture deliberately exercises the console.log → print/println
      // lowering (the only universal side effect with zero deps).
      // oxlint-disable-next-line no-console
      console.log(values)
    },
  })

  return (
    <Stack gap={3} padding={4} data-testid="signin-page">
      <Text>Sign In</Text>
      <Field
        value={form.values.username}
        onChangeText={(v) => form.setFieldValue('username', v)}
        placeholder="Username"
        data-testid="signin-username"
      />
      <Show when={() => form.errors.username !== ''}>
        <Text data-testid="signin-error">{form.errors.username}</Text>
      </Show>
      <Button
        onPress={() => form.submit()}
        disabled={form.isSubmitting}
        data-testid="signin-submit"
      >
        Continue
      </Button>
    </Stack>
  )
}
