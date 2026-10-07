import { useSessionStorage, useMemoryStorage, useStorage } from '@pyreon/storage'
import { Stack, Text } from '@pyreon/primitives'

export function Process(props: { start: number }) {
  const session = useSessionStorage<string>('s', 'a')
  const memory = useMemoryStorage<number>('m', 3)
  const inferred = useSessionStorage('i', true)
  const noInitial = useMemoryStorage<number>('n')
  const fromProps = useSessionStorage<number>('p', props.start)
  const dynamicKey = useStorage<string>(props.start > 0 ? 'a' : 'b', 'x')
  const dynamicInitial = useStorage<number>('d', props.start)
  const { value } = useStorage<string>('destructured', 'v')
  return (
    <Stack>
      <Text>{session()}</Text>
      <Text>{memory()}</Text>
      <Text>{inferred() ? 'y' : 'n'}</Text>
      <Text>{noInitial()}</Text>
      <Text>{fromProps()}</Text>
      <Text>{dynamicKey()}</Text>
      <Text>{dynamicInitial()}</Text>
      <Text>{value}</Text>
    </Stack>
  )
}
