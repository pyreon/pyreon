import { model } from '@pyreon/state-tree'
import { Button, Stack, Text } from '@pyreon/primitives'

export const cart = model({ state: { total: 0.5, label: 'cart', active: true } })
  .views((owner) => ({ doubled: () => owner.total() * 2 }))
  .views((owner) => ({ cumulative: () => owner.doubled() + owner.total() }))
  .actions((owner) => ({
    add: (amount: number = 0.5) => owner.total.set(owner.total() + amount),
    reset: () => {
      owner.total.set(0.5)
      owner.label.set('reset')
    },
  }))
  .create()

const quoted = model({ state: { count: 1 } })
  .views(() => ({ answer: () => 42 }))
  .create()

export function ModelModule() {
  return (
    <Stack>
      <Text>{cart.total()}</Text>
      <Text>{cart.cumulative()}</Text>
      <Text>{quoted.answer()}</Text>
      <Button onPress={() => cart.add(2.5)}>Add</Button>
      <Button onPress={() => cart.reset()}>Reset</Button>
    </Stack>
  )
}
