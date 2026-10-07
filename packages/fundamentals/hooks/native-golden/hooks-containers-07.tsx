import { useDatabase as useStore, useMap, useAuth } from '@pyreon/hooks'
import { useWebSocket } from './mine'
import { Stack, Text } from '@pyreon/primitives'

// An aliased hook import, and a same-named import from elsewhere that is not the library's.
export function Mixed() {
  const db = useStore()
  const ws = useWebSocket('wss://x.example')
  const map = useMap()
  const auth = useAuth<{ id: string }>()
  return <Stack><Text>{String(db.all('a').length) + String(ws) + String(map.markers().length) + String(auth.status())}</Text></Stack>
}
