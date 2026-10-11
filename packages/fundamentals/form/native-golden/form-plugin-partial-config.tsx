import { useForm } from '@pyreon/form'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const blank = useForm()
  const dynamic = useForm(config)
  const partial = useForm({ initialValues: values })
  const spread = useForm({ ...base, initialValues: { ...defaults, name: 'n', count: 3 },
    validators: { ...rules, name: (v) => v ? '' : 'required', odd: ({ x: _x }) => '' },
    onSubmit: () => {},
  })
  return <Stack><Text>{blank.isValid()}</Text><Text>{dynamic.isValid()}</Text><Text>{partial.isValid()}</Text><Text>{spread.values().name}</Text></Stack>
}
