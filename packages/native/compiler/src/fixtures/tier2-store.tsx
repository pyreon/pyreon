// Tier-2 Strategy-B fixture for @pyreon/store (Gap 4 PR-4 → v2).
//
// v2 scope verified:
//   - defineStore("id", () => { ...; return { ... } })
//   - Signal fields incl. EMPTY-ARRAY seeds (`signal<Task[]>([])` —
//     needs the explicit mutableStateOf<List<Task>> type arg on Kotlin)
//   - COMPUTEDS in the setup body → Swift computed property /
//     Kotlin `val X get() = …` (Compose-reactive through the
//     mutableStateOf reads)
//   - METHODS in the setup body (args + multi-statement bodies +
//     `.update` lowering composing inside them) → singleton members
//   - Use-site chain rewriting: reads `useFoo().store.X()` →
//     `PyreonStore_foo.X`, method calls `useFoo().store.M(args)` →
//     `PyreonStore_foo.M(args)` (parens + args preserved)
//   - A method writing a NON-returned signal (`nextId`) — v2 emits ALL
//     setup decls on the singleton (the v1 exported-only filter broke
//     this body)
//
// Deferred (documented follow-ups, each its own PR):
//   - Block-body computeds in the setup
//   - patch({ ... }) batched updates
//   - subscribe(listener) watchers
//   - Destructure use form: const { store, patch } = useCounter()

import { defineStore } from '@pyreon/store'
import { signal, computed } from '@pyreon/reactivity'
import { For } from '@pyreon/core'
import { Stack, Inline, Text, Button } from '@pyreon/primitives'

type Task = { id: number; title: string; done: boolean }

const useCounter = defineStore('counter', () => {
  const count = signal(0)
  const label = signal('counter')
  return { count, label }
})

const useTasks = defineStore('tasks', () => {
  const tasks = signal<Task[]>([])
  const nextId = signal<number>(1)
  const remaining = computed(() => tasks().filter((t) => !t.done).length)
  const addTask = (title: string) => {
    tasks.set([...tasks(), { id: nextId(), title, done: false }])
    nextId.update((n) => n + 1)
  }
  const toggle = (id: number) => {
    tasks.update((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  }
  const clear = () => tasks.set([])
  return { tasks, remaining, addTask, toggle, clear }
})

export function CounterView() {
  return (
    <Stack>
      <Text>{useCounter().store.label()}</Text>
      <Text>Count: {useCounter().store.count()}</Text>
      <Button onPress={() => useCounter().store.count.set(useCounter().store.count() + 1)}>
        Increment
      </Button>
    </Stack>
  )
}

export function TasksView() {
  return (
    <Stack>
      <Text>{useTasks().store.remaining()} open</Text>
      <For each={useTasks().store.tasks} by={(t) => t.id}>
        {(t) => (
          <Inline gap={2}>
            <Button onPress={() => useTasks().store.toggle(t.id)}>
              {t.done ? 'done' : 'todo'}
            </Button>
            <Text>{t.title}</Text>
          </Inline>
        )}
      </For>
      <Inline gap={2}>
        <Button onPress={() => useTasks().store.addTask('new task')}>Add</Button>
        <Button onPress={() => useTasks().store.clear()}>Clear</Button>
      </Inline>
    </Stack>
  )
}
