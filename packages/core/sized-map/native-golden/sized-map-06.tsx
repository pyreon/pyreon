import { SizedMap } from '@pyreon/sized-map'
import { Text } from '@pyreon/primitives'
const maxEntries = 'lru'
export function App(){ const m = new SizedMap<string, number>({ [maxEntries]: 5 }); return <Text>x</Text> }
