import { onMount } from '@pyreon/core'
import { useWebSocket } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'

const URL = 'wss://const.example/socket'

// An explicit connect (so none is synthesized), a second socket without one, a non-literal url, a const url, and a destructure.
export function Feeds(props: { url: string }) {
  const a = useWebSocket('wss://a.example')
  const b = useWebSocket('wss://b.example')
  const c = useWebSocket(props.url)
  const d = useWebSocket(URL)
  const { lastMessage, isConnected } = useWebSocket('wss://c.example')
  onMount(() => { a.connect() })
  return <Stack><Text>{String(a.lastMessage()) + String(b.messages()) + String(c) + String(d) + String(lastMessage) + String(isConnected)}</Text></Stack>
}
