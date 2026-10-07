import { SizedMap } from '@pyreon/sized-map'
import { Stack, Text } from '@pyreon/primitives'
export function C(){ const m = new SizedMap<string, number>({ maxEntries: 5, lru: true }); return (<Stack><Text>x</Text></Stack>) }
