import { Stack, Text, Press } from '@pyreon/primitives'
import { useForm } from '@pyreon/form'
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const S = zodSchema(z.object({ email: z.string().email(), nick: z.string().min(2) }))
export function App() {
  const form = useForm({
    initialValues: { email: '', nick: '' },
    schema: S,
    validators: { email: (v) => (v === '' ? 'required' : undefined) },
    onSubmit: () => {},
  })
  return (<Stack><Press onPress={() => {}}><Text>{() => String(form.values().email)}</Text></Press></Stack>)
}
