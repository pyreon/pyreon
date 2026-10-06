import { Text, Press, Stack } from '@pyreon/primitives'
import { SizedMap } from '@pyreon/sized-map'
export function App(){
const y = 1
 const m = new SizedMap<string, number>({ 'maxEntries': 10, lru: true, y })
 const m3 = new SizedMap<string, number>({ maxEntries: 5, lru: false })
 return <Text>x</Text> }
