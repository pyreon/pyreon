import { Text, Press, Stack } from '@pyreon/primitives'
import { announce } from '@pyreon/a11y'
export function App(){ return <Press onPress={() => { announce(); announce("a", { politeness: "polite", ['k']: 1 }); announce("b", { 'politeness': 'assertive' }) }}><Text>x</Text></Press> }
