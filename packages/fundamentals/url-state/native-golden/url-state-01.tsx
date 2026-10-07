import { useUrlState } from '@pyreon/url-state'
import { Stack, Text, Button } from '@pyreon/primitives'

const FILTER_KEY = 'filter'

export function Defaults() {
  const q = useUrlState('q', '')
  const page = useUrlState('page', 1)
  const zoom = useUrlState('zoom', 1.5)
  const open = useUrlState('open', false)
  const offset = useUrlState('offset', -1)
  const shift = useUrlState('shift', +2)
  const drop = useUrlState('drop', -0.5)
  const none = useUrlState('none')
  const filter = useUrlState(FILTER_KEY, 'all')
  return (
    <Stack>
      <Text>{q()}</Text>
      <Text>{`Page ${page()} of ${zoom()}`}</Text>
      <Text>{open() ? 'open' : 'closed'}</Text>
      <Text>{offset() + shift() + drop()}</Text>
      <Text>{none()}</Text>
      <Text>{filter()}</Text>
      <Button onPress={() => page.set(page() + 1)}>next</Button>
      <Button onPress={() => q.set('x')}>set</Button>
      <Button onPress={() => open.set(!open())}>toggle</Button>
      <Button onPress={() => zoom.set(zoom() * 2)}>zoom</Button>
    </Stack>
  )
}
