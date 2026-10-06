import { useForm } from '@pyreon/form'
import { Stack, Text } from '@pyreon/primitives'
export function F() {
  const form = useForm({ initialValues: { email: '' }, schema: Missing, onSubmit: (v) => {} })
  return (<Stack><Text>hi</Text></Stack>)
}
