import { z } from 'zod'
import { zodSchema } from '@pyreon/validation'
import { useForm } from '@pyreon/form'
import { Stack, Text, Field, Button } from '@pyreon/primitives'
const Signup = zodSchema(z.object({ name: z.string().min(3), age: z.number() }))
export function C() {
  const f = useForm({ initialValues: { name: '' }, schema: Signup, onSubmit: () => {} })
  return (<Stack><Field value={f.values().name} onChangeText={(v) => f.setFieldValue('name', v)} /><Button onPress={() => f.handleSubmit()}>go</Button><Text>{String(f.isValid())}</Text></Stack>)
}
