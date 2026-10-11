import { useForm, useFieldArray } from '@pyreon/form'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const key = 'email'
  const form = useForm({ [key]: true, initialValues: { [key]: '', title: 'hello', count: 3 },
    validators: { title: (_v) => { return '' }, [key]: (_v) => '', extra: (_a, _b) => '', odd: ({ x: _x }) => '' },
    schema: Unknown,
  })
  const _invalid = useFieldArray([1])
  const _dynamic = useFieldArray(key)
  return <Stack><Text>{form.values().title}</Text></Stack>
}
