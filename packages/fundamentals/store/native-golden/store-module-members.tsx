import { computed, signal } from '@pyreon/reactivity'
import { defineStore } from '@pyreon/store'
import { Button, Stack, Text } from '@pyreon/primitives'

const STORE_ID = 'module-state'
export const useModule = defineStore(STORE_ID, () => {
  const total = signal(0.5)
  const rows = signal<number[]>([1, 2])
  const unset = signal()
  const doubled = computed(() => total() * 2)
  const cumulative = computed(() => doubled() + total())
  const add = (amount: number = 0.5): number => {
    total.set(total() + amount)
    return total()
  }
  const clear = () => rows.set([])
  return { total, rows, unset, doubled, cumulative, add, clear }
})

export function StoreModule() {
  const app = useModule()
  const size = computed(() => app.store.rows().length)
  return (
    <Stack>
      <Text>{app.store.cumulative()}</Text>
      <Text>{size()}</Text>
      <Button onPress={() => useModule().store.add()}>Add</Button>
      <Button onPress={() => app.store.rows.update((rows) => rows.concat([3]))}>Append</Button>
      <Button onPress={() => app.store.total.set(4.5)}>Set</Button>
      <Button onPress={() => useModule().store.clear()}>Clear</Button>
    </Stack>
  )
}
