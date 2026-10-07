import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'
import { Stack, Text } from '@pyreon/primitives'
export function C(){ const doc = new PyreonCrdtDoc(); const s = syncedSignal({ key: 'k', initial: 0 }); return (<Stack><Text>x</Text></Stack>) }
