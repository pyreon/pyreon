import { useForm } from '@pyreon/form'
import { signal } from '@pyreon/reactivity'
import { Stack, Field, Text, Button } from '@pyreon/primitives'
export function App() {
  const last = signal('')
  const form = useForm({
    initialValues: { email: 'a@b.com', city: '' },
    validators: { email: (v) => v.length < 3 ? 'short' : '' },
    onSubmit: (values) => { last.set(values.email); form.setFieldValue('city', '') },
  })
  return <Stack>
    <Field value={form.values().email} />
    <Field value={form.values.city} />
    <Text>{form.errors().email}</Text><Text>{form.touched().city}</Text>
    <Text>{form.isValid()}</Text><Text>{form.isSubmitting()}</Text>
    <Button onPress={() => form.submit()}>Go</Button><Text>{last()}</Text>
  </Stack>
}
