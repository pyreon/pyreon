import { signal } from '@pyreon/reactivity'
import { useSecureStorage } from '@pyreon/hooks'
import { Stack, Text, Button } from '@pyreon/primitives'

// Every method (labelled on Swift), the optional string `read` returns, and a rehydrate-style branch on it.
export function Vault() {
  const secrets = useSecureStorage()
  const token = secrets.read('token')
  const shown = signal('')
  const { read } = useSecureStorage()
  return (
    <Stack>
      <Button onPress={() => secrets.write('token', 'abc')}>save</Button>
      <Button onPress={() => secrets.remove('token')}>clear</Button>
      <Text>{token ? 'signed in' : 'signed out'}</Text>
      <Text>{secrets.read('token') ?? 'none'}</Text>
      <Text>{secrets.contains('token') ? 'yes' : 'no'}</Text>
      <Text>{shown()}</Text>
      <Text>{String(read)}</Text>
      <Button onPress={() => secrets.write('only-one')}>short</Button>
    </Stack>
  )
}
