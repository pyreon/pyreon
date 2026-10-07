import { kinetic } from '@pyreon/kinetic'
import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button, For } from '@pyreon/primitives'

const Card = kinetic('div').preset('scale-in')

export function Attrs(props: { items: string[] }) {
  const open = signal(true)
  return (
    <Stack>
      <Card show={open()} className="card" data-testid="card"><Text>shown</Text></Card>
      <Card><Button onPress={() => open.set(!open())}>toggle</Button></Card>
      <For each={props.items} by={(i) => i}>{(i) => <Card><Text>{i}</Text></Card>}</For>
      <Card />
    </Stack>
  )
}
