import { Text, Press, Stack } from '@pyreon/primitives'
import { toast } from '@pyreon/toast'
export function App(){ return <Press onPress={() => { const k = "duration"; const o = {}; toast("m", { [k]: 5, ...o, 'x': 1, duration: "5" }) }}><Text>x</Text></Press> }
