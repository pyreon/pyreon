import { useForm, useFieldArray } from '@pyreon/form'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const key = 'email'
  const form = useForm({ [key]: true, initialValues: { [key]: '', title: 'hello', count: 3 },
    validators: { title: (v) => { return '' }, [key]: (v) => '', extra: (a, b) => '', odd: ({ x }) => '' },
    schema: Unknown,
  })
  const invalid = useFieldArray([1])
  const dynamic = useFieldArray(key)
  return <Stack><Text>{form.values().title}</Text></Stack>
}
