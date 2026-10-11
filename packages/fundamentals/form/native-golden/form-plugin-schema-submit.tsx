import { useForm } from '@pyreon/form'
import { zodSchema } from '@pyreon/validate'
import { z } from 'zod'
import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
const Profile = zodSchema(z.object({ name: z.string().min(2), city: z.string().min(1) }))
export function App() {
  const last = signal('')
  const form = useForm({ initialValues: { name: '', city: '' }, schema: Profile,
    validators: { name: (v) => v ? '' : 'name' },
    onSubmit: ({ name }) => last.set(name),
  })
  return <Stack><Text>{form.errors().city}</Text><Text>{last()}</Text><Button onPress={() => form.submit()}>Go</Button></Stack>
}
