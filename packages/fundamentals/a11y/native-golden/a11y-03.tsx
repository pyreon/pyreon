import { Text, Press, Stack } from '@pyreon/primitives'
import { toast } from '@pyreon/toast'
import { announce } from '@pyreon/a11y'
const d = 5
const p = 'assertive'
export function App(){ return <Press onPress={() => { toast("m", { duration: d }); announce("a", { politeness: p }) }}><Text>x</Text></Press> }
