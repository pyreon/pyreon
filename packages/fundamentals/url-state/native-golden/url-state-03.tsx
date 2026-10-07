import { useUrlState as useQs } from '@pyreon/url-state'
import { useUrlState } from './mine'
import { Stack, Text, Show } from '@pyreon/primitives'

export function Aliased() {
  const a = useQs('a', 'x')
  const b = useUrlState('b', 'y')
  const { value } = useQs('c', 1)
  return (
    <Stack>
      <Show when={a() === 'x'}><Text>{a()}</Text></Show>
      <Text>{b()}</Text>
      <Text>{value}</Text>
    </Stack>
  )
}

export function Sibling() {
  const page = useQs('page', 1)
  const items = [1, 2, 3]
  return <Stack><Text>{items.length + page()}</Text></Stack>
}
