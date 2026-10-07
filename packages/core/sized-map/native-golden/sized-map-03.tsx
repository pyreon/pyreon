import { Text, Press, Stack } from '@pyreon/primitives'
import { SizedMap } from '@pyreon/sized-map'
export function App(){ const m = new SizedMap<string, number>({ maxEntries: 5, lru: 'yes' }); return <Text>x</Text> }
