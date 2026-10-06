import { s } from '@pyreon/validate'
import { useForm } from '@pyreon/form'
import { Stack, Text } from '@pyreon/primitives'
export const Signup = s.object({ email: s.string().min(3), name: s.string().max(9) })
export type Signup = { email: string; name: string }
export function F() {
  const f = useForm({ initialValues: { email: '', name: '' }, schema: Signup, onSubmit: () => {} })
  return (<Stack><Text>{String(f.isValid())}</Text></Stack>)
}
