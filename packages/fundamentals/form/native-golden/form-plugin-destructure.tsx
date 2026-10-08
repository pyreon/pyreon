import { useForm } from '@pyreon/form'
import { Stack, Text, Field } from '@pyreon/primitives'
export function App() {
  const { values: readValues, errors, isValid } = useForm({ initialValues: { email: '' } })
  return <Stack><Field value={readValues().email} /><Text>{errors().email}</Text><Text>{isValid()}</Text></Stack>
}
