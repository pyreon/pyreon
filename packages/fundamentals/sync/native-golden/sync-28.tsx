
import { syncedSignal } from '@pyreon/sync'
import { Stack, Text } from '@pyreon/primitives'
const thing = syncedSignal({ doc, key: 'count', initial: 0 })
export function C() { return (<Stack><Text>x</Text></Stack>) }
