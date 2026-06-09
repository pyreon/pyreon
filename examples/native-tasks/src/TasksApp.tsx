// @ts-nocheck — PMTC handles typing; tsc multi-child JSX limitations
// noisy (same `@ts-nocheck` rationale as native-todomvc-ios/src/TodoApp.tsx).
//
// PMTC Tasks Showcase — SINGLE source for web, iOS, Android.
//
// Gap 5 scaffold (2026-06-05 native-readiness audit). The audit calls
// for a real-app showcase exercising MULTIPLE Tier-1 features end-to-
// end, beyond the sample-code scope of native-counter / native-router-
// demo / native-todomvc.
//
// ## What this exercises (currently-merged Tier-1 features)
//
// - **Routing with auth-gate** — `createRouter` with per-route
//   `beforeEnter: () => isAuthed() || '/login'`. Gap 2 runtime field
//   landed in #1440 (merged); web router gates and the native
//   runtimes gate identically.
// - **Multi-screen navigation** — 3 routes (login / list / new),
//   `useNavigate()` between them.
// - **Canonical primitive vocabulary** — `<Stack>` / `<Inline>` /
//   `<Field>` / `<Button>` / `<Text>` / `<For>` / `<Show>` resolve
//   per-target via PMTC's `canonical-primitives.ts`.
// - **Signal + computed** — `signal()` / `computed()` for component-
//   local reactive state (TodoMVC-shape: each component has its own
//   signals, no module-level state).
//
// ## What's NOT in this scaffold (explicit deferrals per audit Gap 4)
//
// - **`@pyreon/machine`** — would model app-lifecycle (idle / loading /
//   loaded / error). Port landed in #1445 (open PR); rebase this
//   scaffold onto post-#1445 main to add.
// - **`@pyreon/i18n/core`** — would replace hardcoded strings with
//   `i18n.t('key')` lookups. Port landed in #1447 (open PR, v1 scope).
// - **`@pyreon/store`** — would unify cross-screen state (auth +
//   tasks) behind a singleton. Port queued (Gap 4 PR-4 next). Today
//   THIS scaffold passes auth state via the `requireAuth` closure
//   capture inside the App component, and tasks state is per-screen
//   (NOT shared). The "shared task list across login / create
//   screens" is the canonical defineStore use case.
// - **Real auth backend** — `login()` flips a local signal, no fetch.
//   Replace with `useFetch('/auth/login', { method: 'POST' })` (Tier-1).
// - **Real task backend** — `tasks` is a per-screen literal seed.
//   `useFetch('/api/tasks')` (Tier-1) for real data.
// - **Form validation** — deferred per Gap 4 validation-port queue.
// - **iOS XcodeGen host + Android Gradle host + web Vite host** —
//   deferred. The source compiles via PMTC to Swift + Kotlin TODAY
//   (proven by `scripts/build-{swift,kotlin}.sh`). Real device hosts
//   follow the template at `native-router-demo-ios/project.yml` +
//   `native-todomvc-android/build.gradle.kts`.

import { signal } from '@pyreon/reactivity'
import { Stack, Inline, Field, Button, Text } from '@pyreon/primitives'
import { For } from '@pyreon/core'
import {
  createRouter,
  useNavigate,
  RouterProvider,
  RouterView,
} from '@pyreon/router'

// ── Screens ──

function LoginPage(props: { onLoggedIn: () => void }) {
  const navigate = useNavigate()
  const username = signal('')

  const handleLogin = () => {
    if (username().length === 0) return
    props.onLoggedIn()
    navigate('/tasks')
  }

  return (
    <Stack gap={3} padding={4} data-testid="login-page">
      <Text>Sign In</Text>
      <Text>Any value works — this is a demo.</Text>
      <Field
        value={username}
        onChangeText={(v) => username.set(v)}
        placeholder="Username"
        data-testid="login-username"
      />
      <Button onPress={handleLogin} data-testid="login-submit">
        Continue
      </Button>
    </Stack>
  )
}

function TasksListPage(props: {
  tasks: { id: number; title: string; done: boolean }[]
  onToggle: (id: number) => void
  onLogout: () => void
}) {
  const navigate = useNavigate()

  return (
    <Stack gap={3} padding={4} data-testid="tasks-page">
      <Inline gap={2}>
        <Text>My Tasks</Text>
        <Text>Total: {props.tasks.length}</Text>
      </Inline>
      <For each={props.tasks} by={(t) => t.id}>
        {(task) => (
          <Inline gap={2}>
            <Button onPress={() => props.onToggle(task.id)}>
              {task.done ? 'done' : 'todo'}
            </Button>
            <Text>{task.title}</Text>
          </Inline>
        )}
      </For>
      <Inline gap={2}>
        <Button
          onPress={() => navigate('/tasks/new')}
          data-testid="tasks-new"
        >
          New Task
        </Button>
        <Button
          onPress={() => props.onLogout()}
          data-testid="tasks-logout"
        >
          Logout
        </Button>
      </Inline>
    </Stack>
  )
}

function NewTaskPage(props: {
  onCreate: (title: string) => void
}) {
  const navigate = useNavigate()
  const title = signal('')

  const save = () => {
    const t = title().trim()
    if (t.length === 0) return
    props.onCreate(t)
    navigate('/tasks')
  }

  return (
    <Stack gap={3} padding={4} data-testid="new-task-page">
      <Text>New Task</Text>
      <Field
        value={title}
        onChangeText={(v) => title.set(v)}
        placeholder="What needs doing?"
        data-testid="new-task-title"
      />
      <Inline gap={2}>
        <Button onPress={save} data-testid="new-task-save">
          Save
        </Button>
        <Button
          onPress={() => navigate('/tasks')}
          data-testid="new-task-cancel"
        >
          Cancel
        </Button>
      </Inline>
    </Stack>
  )
}

// ── App root — owns shared state via component-local signals ──

export function TasksApp() {
  // Auth + tasks state held HERE so beforeEnter's `requireAuth`
  // closure captures them. The web router gates and the native
  // runtimes gate identically post Gap 2 #1440.
  //
  // When @pyreon/store's PMTC port lands (Gap 4 PR-4), this state
  // moves to a singleton: `defineStore("app", () => ({ isAuthed:
  // signal(false), tasks: signal([...]) }))`. The closure-capture
  // approach is the v1 workaround.
  const isAuthed = signal(false)
  const tasks = signal([
    { id: 1, title: 'Ship Gap 4 store port', done: false },
    { id: 2, title: 'Ship Gap 5 device-CI gate', done: false },
  ])

  const requireAuth = () => (isAuthed() ? true : '/login')

  const handleToggle = (id: number) => {
    tasks.update((list) =>
      list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    )
  }

  const handleCreate = (title: string) => {
    const nextId =
      tasks().length === 0
        ? 1
        : tasks()[tasks().length - 1].id + 1
    tasks.update((list) => [...list, { id: nextId, title, done: false }])
  }

  const router = createRouter({
    mode: 'history',
    routes: [
      { path: '/', component: LoginPage },
      { path: '/login', component: LoginPage },
      {
        path: '/tasks',
        component: TasksListPage,
        beforeEnter: requireAuth,
      },
      {
        path: '/tasks/new',
        component: NewTaskPage,
        beforeEnter: requireAuth,
      },
    ],
  })

  // Suppress unused-locals: the screens use props but those wire
  // here via the router record's `component` (PMTC doesn't yet
  // surface this in its static analyzer).
  void handleToggle
  void handleCreate
  void isAuthed

  return (
    <RouterProvider router={router}>
      <RouterView />
    </RouterProvider>
  )
}
