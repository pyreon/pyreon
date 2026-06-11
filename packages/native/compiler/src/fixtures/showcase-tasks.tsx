// @ts-nocheck — PMTC handles typing; tsc multi-child JSX limitations
// noisy (same `@ts-nocheck` rationale as native-todomvc-ios/src/TodoApp.tsx).
//
// PMTC Tasks Showcase — SINGLE source for web, iOS, Android.
//
// Gap 5 showcase, STORE-BACKED (2026-06-10, the Gap 4 closure). The
// first rewrite dropped the auth-gate + cross-screen state because the
// original scaffold faked them (prop-requiring components as bare
// route components — broken on every target including web). This
// revision restores BOTH on the real foundation: ONE `defineStore`
// singleton holds the auth flag + the task list, every screen reads
// and mutates it through the store, and the per-route `beforeEnter`
// guard reads the same store state. PMTC lowers the store to an
// `@Observable` singleton class (SwiftUI) / a `mutableStateOf`-backed
// `object` (Compose) — both are reactive ACROSS screens, which is
// exactly what `rememberPyreonStorage` could not provide on Android
// (per-composable `remember(key)`).
//
// ## What this exercises (all proven end-to-end)
//
// - **Cross-screen store** — `defineStore('app', ...)` with a boolean
//   auth flag + a `Task[]` list; reads (`useApp().store.tasks()`),
//   writes (`.set(...)` → native assignment), and `<For
//   each={useApp().store.tasks}>` all lower per-target.
// - **Auth-gate** — `beforeEnter: () => useApp().store.isAuthed()`
//   compiles into the dispatcher's inline guard; LoginPage flips the
//   flag through the store and the gate opens. Logout flips it back.
// - **Typed route params** — `/tasks/:id` + `props: { params: { id:
//   string } }` → synthesized `TaskDetailPageParam` constructed by the
//   dispatcher from the matched segment.
// - **Multi-screen routing** — login / tasks / detail via
//   `useNavigate()`.
// - **Validated form (useForm)** — the login is a real validated form:
//   runtime Field binding, per-field validator, error display via
//   `form.errors.username`, submit gating. The device smokes assert
//   the error path BEFORE the happy path.
// - **Canonical primitives + signals** — `<Stack>` / `<Inline>` /
//   `<Field>` / `<Button>` / `<Text>` / `<For>` / `<Show>`; component-
//   local `signal` for the task draft; `computed` remaining-count over
//   store state.
//
// ## What's NOT here (explicit deferrals)
//
// - **Real auth/task backend** — `useFetch` (Tier-1) replaces the
//   local flag + literal seed when a backend exists.
// - **Form validation** — deferred per the Gap 4 validation-port queue.
// - **Store computeds/methods in the setup body** — store v1 lowers
//   signals; derived state lives in component-level `computed` for now.

import { signal, computed } from '@pyreon/reactivity'
import { useForm } from '@pyreon/form'
import { useFetch } from '@pyreon/hooks'
import { defineStore } from '@pyreon/store'
import { For, Show } from '@pyreon/core'
import { Stack, Inline, Field, Button, Text, Image, Icon } from '@pyreon/primitives'
import {
  createRouter,
  useNavigate,
  RouterProvider,
  RouterView,
} from '@pyreon/router'

type Task = { id: number; title: string; done: boolean }
type Quote = { id: number; text: string; author: string }

// Module-scope monotonic id — same shape as TodoMVC's `nextId`.
let nextTaskId = 3

// ── Shared state — ONE store, read/written from every screen ──

const useApp = defineStore('app', () => {
  const isAuthed = signal(false)
  const tasks = signal<Task[]>([
    { id: 1, title: 'Ship the typed-params arc', done: false },
    { id: 2, title: 'Keep the device gate green', done: false },
  ])
  return { isAuthed, tasks }
})

// ── Screens ──

function LoginPage() {
  const navigate = useNavigate()

  // The validated-form shape (the form-binding arc): the runtime
  // Field binding routes keystrokes through setValue (re-validating
  // once a field carries an error), submit() gates on validateAll,
  // and onSubmit only fires when valid. This screen is the device
  // proof for useForm — its UITest asserts the ERROR path (short
  // username → message appears, navigation blocked) before the
  // happy path.
  const form = useForm({
    initialValues: { username: '' },
    validators: {
      username: (v) => (v.length < 3 ? 'At least 3 characters' : ''),
    },
    onSubmit: (_values) => {
      useApp().store.isAuthed.set(true)
      navigate('/tasks')
    },
  })

  return (
    <Stack gap={3} padding={4} data-testid="login-page">
      <Image
        src="pyreon-logo.png"
        alt="Pyreon"
        width={28}
        height={28}
        fit="contain"
        data-testid="brand-logo"
      />
      <Text font="Brand" data-testid="brand-title">Sign In</Text>
      <Text>At least 3 characters — this is a demo.</Text>
      <Field
        value={form.values.username}
        onChangeText={(v) => form.setFieldValue('username', v)}
        placeholder="Username"
        data-testid="login-username"
      />
      <Show when={() => form.errors.username !== ''}>
        <Text data-testid="login-error">{form.errors.username}</Text>
      </Show>
      <Button onPress={() => form.submit()} data-testid="login-submit">
        Continue
      </Button>
    </Stack>
  )
}

function TasksPage() {
  const navigate = useNavigate()
  const draft = signal<string>('')

  const remaining = computed(
    () => useApp().store.tasks().filter((t) => !t.done).length,
  )

  const addTask = () => {
    const title = draft().trim()
    if (title.length === 0) return
    useApp().store.tasks.set([
      ...useApp().store.tasks(),
      { id: nextTaskId++, title, done: false },
    ])
    draft.set('')
  }

  const toggle = (id: number) => {
    useApp().store.tasks.set(
      useApp()
        .store.tasks()
        .map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    )
  }

  const logout = () => {
    useApp().store.isAuthed.set(false)
    navigate('/login')
  }

  return (
    <Stack gap={3} padding={4} data-testid="tasks-page">
      <Inline gap={2}>
        <Icon name="star" color="primary" size="md" data-testid="header-icon" />
        <Text>My Tasks</Text>
        <Text>{remaining} open</Text>
      </Inline>
      <For each={useApp().store.tasks} by={(t) => t.id}>
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
        <Button onPress={() => navigate('/quotes')} data-testid="tasks-quotes">
          Quotes
        </Button>
        <Button onPress={logout} data-testid="tasks-logout">
          Logout
        </Button>
      </Inline>
    </Stack>
  )
}

function QuotesPage() {
  const navigate = useNavigate()

  // The networked screen (fetch-arc device proof): useFetch fires the
  // request at mount on every target — web through @pyreon/hooks'
  // signal container, iOS through the emitted URLSession `.task {}`,
  // Android through the `LaunchedEffect` + kotlinx-serialization
  // harness. 127.0.0.1 reaches the CI fixture server on BOTH device
  // targets: the iOS Simulator shares the host loopback, and the
  // Android job `adb reverse`s the port into the emulator.
  const quotes = useFetch<Quote[]>('http://127.0.0.1:8787/quotes.json')
  const quoteList = computed(() => quotes.data() ?? [])

  return (
    <Stack gap={3} padding={4} data-testid="quotes-page">
      <Text>Quotes</Text>
      <Show when={quotes.isPending}>
        <Text data-testid="quotes-loading">Loading…</Text>
      </Show>
      <Show when={() => quotes.error() !== undefined}>
        <Text data-testid="quotes-error">{quotes.error}</Text>
      </Show>
      <For each={quoteList} by={(q) => q.id}>
        {(q) => (
          <Stack gap={1} data-testid="quote-row">
            <Text>{q.text}</Text>
            <Text>{q.author}</Text>
          </Stack>
        )}
      </For>
      <Inline gap={2}>
        <Button onPress={() => quotes.refetch()} data-testid="quotes-refetch">
          Refetch
        </Button>
        <Button onPress={() => navigate('/tasks')} data-testid="quotes-back">
          Back to tasks
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
  // The guard reads the SAME store the screens mutate — `beforeEnter`
  // compiles into the dispatcher's inline conditional on each target,
  // and the web router evaluates it at navigation time. Unauthed
  // navigation to a gated route is denied (native renders the
  // catch-all denial; web cancels the navigation).
  //
  // `mode: 'history'` is web-only; PMTC reads only `routes` and the
  // native navigation stacks ignore it (same note as router-demo).
  const router = createRouter({
    mode: 'history',
    routes: [
      { path: '/', component: LoginPage },
      { path: '/login', component: LoginPage },
      {
        path: '/tasks',
        component: TasksPage,
        beforeEnter: () => useApp().store.isAuthed(),
      },
      {
        path: '/tasks/:id',
        component: TaskDetailPage,
        beforeEnter: () => useApp().store.isAuthed(),
      },
      {
        path: '/quotes',
        component: QuotesPage,
        beforeEnter: () => useApp().store.isAuthed(),
      },
    ],
  })

  return (
    <RouterProvider router={router}>
      <RouterView />
    </RouterProvider>
  )
}
