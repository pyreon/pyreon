// @ts-nocheck — PMTC handles typing; tsc multi-child JSX limitations
// noisy (same `@ts-nocheck` rationale as native-todomvc-ios/src/TodoApp.tsx).
//
// PMTC Tasks Showcase — SINGLE source for web, iOS, Android.
//
// Gap 5 scaffold, REWRITTEN to the PROVEN Tier-1 subset (2026-06-10).
// The original scaffold over-reached the current vocabulary: it passed
// required props (task list, callbacks) to bare route components —
// route components receive no props from the dispatcher on ANY target
// (on web, RouterView mounts them prop-less too, so `props.tasks.length`
// crashed there as well). The emitted Swift/Kotlin used `.update()`,
// indexed `tasks()[i]`, and tuple literals — none in the supported
// surface — so neither native target compiled. This rewrite keeps every
// feature that IS proven end-to-end and drops what structurally needs
// the @pyreon/store port.
//
// ## What this exercises (proven Tier-1 features)
//
// - **Multi-screen routing** — 3 routes (home / tasks / task detail),
//   `useNavigate()` between them.
// - **Typed route params** — `/tasks/:id` + `props: { params: { id:
//   string } }`. PMTC synthesizes `TaskDetailPageParam` (Swift struct /
//   Kotlin data class) and the dispatcher constructs it from the
//   matched path segments — the typed-params arc this showcase gates
//   at real-device scope.
// - **Canonical primitive vocabulary** — `<Stack>` / `<Inline>` /
//   `<Field>` / `<Button>` / `<Text>` / `<For>`.
// - **Signal + computed + list mutation** — `signal<Task[]>` seeded
//   with literals (struct-constructor emit), `.set()` with spread-
//   append and map-toggle (the TodoMVC-proven shapes), `computed`
//   remaining-count.
//
// ## What's NOT here (explicit deferrals)
//
// - **Auth-gate + cross-screen task state** — both need ONE shared
//   reactive container reachable from multiple route components.
//   That's the canonical `defineStore` use case (Gap 4 store port).
//   `useStorage` can't substitute: Android's `rememberPyreonStorage`
//   is per-composable (`remember(key)`) — a write in one screen does
//   not recompose another, so an auth flag through storage would work
//   on iOS (`@AppStorage` observes UserDefaults) but silently break on
//   Android. Re-add the login flow when the store port lands.
// - **Real task backend** — `useFetch('/api/tasks')` (Tier-1) for
//   real data; the seed here is a literal.
// - **Form validation** — deferred per the Gap 4 validation-port queue.

import { signal, computed } from '@pyreon/reactivity'
import { For } from '@pyreon/core'
import { Stack, Inline, Field, Button, Text } from '@pyreon/primitives'
import {
  createRouter,
  useNavigate,
  RouterProvider,
  RouterView,
} from '@pyreon/router'

type Task = { id: number; title: string; done: boolean }

// Module-scope monotonic id — same shape as TodoMVC's `nextId`.
let nextTaskId = 3

// ── Screens ──

function HomePage() {
  const navigate = useNavigate()
  return (
    <Stack gap={3} padding={4} data-testid="home-page">
      <Text>Pyreon Tasks</Text>
      <Text>One .tsx source — web, SwiftUI, and Compose.</Text>
      <Button onPress={() => navigate('/tasks')} data-testid="home-open-tasks">
        Open tasks
      </Button>
    </Stack>
  )
}

function TasksPage() {
  const navigate = useNavigate()
  const tasks = signal<Task[]>([
    { id: 1, title: 'Ship the typed-params arc', done: false },
    { id: 2, title: 'Keep the device gate green', done: false },
  ])
  const draft = signal<string>('')

  const remaining = computed(() => tasks().filter((t) => !t.done).length)

  const addTask = () => {
    const title = draft().trim()
    if (title.length === 0) return
    tasks.set([...tasks(), { id: nextTaskId++, title, done: false }])
    draft.set('')
  }

  const toggle = (id: number) => {
    tasks.set(tasks().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  }

  return (
    <Stack gap={3} padding={4} data-testid="tasks-page">
      <Inline gap={2}>
        <Text>My Tasks</Text>
        <Text>{remaining} open</Text>
      </Inline>
      <For each={tasks} by={(t) => t.id}>
        {(t) => (
          <Inline gap={2}>
            <Button onPress={() => toggle(t.id)}>
              {t.done ? 'done' : 'todo'}
            </Button>
            <Text>{t.title}</Text>
          </Inline>
        )}
      </For>
      <Field
        value={draft}
        onChangeText={(v) => draft.set(v)}
        onSubmit={addTask}
        placeholder="What needs doing?"
        data-testid="new-task-title"
      />
      <Inline gap={2}>
        <Button onPress={addTask} data-testid="new-task-add">
          Add
        </Button>
        <Button
          onPress={() => navigate('/tasks/1')}
          data-testid="tasks-open-first"
        >
          Open task 1
        </Button>
        <Button onPress={() => navigate('/')} data-testid="tasks-home">
          Home
        </Button>
      </Inline>
    </Stack>
  )
}

function TaskDetailPage(props: { params: { id: string } }) {
  const navigate = useNavigate()
  return (
    <Stack gap={3} padding={4} data-testid="task-detail-page">
      <Text>Task Detail</Text>
      <Text>Viewing task {props.params.id}</Text>
      <Button onPress={() => navigate('/tasks')} data-testid="detail-back">
        Back to tasks
      </Button>
    </Stack>
  )
}

// ── App root ──

export function TasksApp() {
  // `mode: 'history'` is web-only; PMTC reads only `routes` and the
  // native navigation stacks ignore it (same note as router-demo).
  const router = createRouter({
    mode: 'history',
    routes: [
      { path: '/', component: HomePage },
      { path: '/tasks', component: TasksPage },
      { path: '/tasks/:id', component: TaskDetailPage },
    ],
  })

  return (
    <RouterProvider router={router}>
      <RouterView />
    </RouterProvider>
  )
}
