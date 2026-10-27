import { useUrlState } from '@pyreon/url-state'
import { Stack, Text } from '@pyreon/primitives'

export function Lists() {
  const tags = useUrlState('tags', ['a', 'b'])
  const ids = useUrlState('ids', [1, 2])
  const zoom = useUrlState('zoom', [1.5, 2])
  const flags = useUrlState('flags', [true, false])
  const none = useUrlState('none', [])
  const add = () => tags.set([...tags(), 'c'])
  return (
    <Stack onPress={add}>
      <Text>{`${tags().length} ${ids().length} ${zoom().length} ${flags().length} ${none().length}`}</Text>
      <Text>{tags().slice(0, 1)[0]}</Text>
    </Stack>
  )
}
