import { useWebSocket } from '@pyreon/hooks'
import { Stack, Text, Button, Show } from '@pyreon/primitives'

// An implicit connect (no explicit call): the container connects on mount. Field reads in call and member form, a send, a close.
export function Chat() {
  const ws = useWebSocket('wss://echo.example/socket')
  return (
    <Stack>
      <Text>{ws.lastMessage() ?? 'none'}</Text>
      <Text>{String(ws.messages().length)}</Text>
      <Text>{ws.error ? 'failed' : 'ok'}</Text>
      <Show when={ws.isConnected()}><Text>online</Text></Show>
      <Text>{ws.lastMessage}</Text>
      <Button onPress={() => ws.send('hi')}>send</Button>
      <Button onPress={() => ws.close()}>close</Button>
    </Stack>
  )
}
