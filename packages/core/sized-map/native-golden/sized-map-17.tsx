import { SizedMap } from '@pyreon/sized-map'
import { Stack, Text, Button } from '@pyreon/primitives'

type Point = { x: number; y: number }

const seen = new SizedMap<string, Point>({ maxEntries: 4, lru: true })
const origin = { x: 0, y: 0 }

export function Surface() {
  const cache = new SizedMap<string, number>({ maxEntries: 2 })
  const pos = { x: 1, y: 2, label: 'p' }
  return (
    <Stack>
      <Text>{String(cache.size)}</Text>
      <Text>{String(seen.size)}</Text>
      <Text>{String(origin.x + pos.x)}</Text>
      <Button onPress={() => { cache.set('a', 1); seen.set('b', origin) }}>set</Button>
      <Button onPress={() => { cache.delete('a'); cache.clear() }}>drop</Button>
      <Text>{cache.has('a') ? 'yes' : 'no'}</Text>
      <Text>{String(cache.get('a') ?? 0)}</Text>
      <Text>{String(cache.keys().length + cache.values().length)}</Text>
    </Stack>
  )
}
