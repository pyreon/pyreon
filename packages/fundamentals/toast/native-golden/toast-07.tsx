import { toast } from '@pyreon/toast'
import { Press, Text } from '@pyreon/primitives'
export function App(){ const k = 'duration'; return <Press onPress={() => toast('m', { [k]: 5 })}><Text>x</Text></Press> }
