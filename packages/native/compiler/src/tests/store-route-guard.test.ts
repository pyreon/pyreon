// Store-backed route guards + cross-component store mutation — the
// emit contracts behind the tasks showcase's restored auth flow
// (Gap 4 closure, 2026-06-10).
//
// The store port (tier2-store.tsx) proves the singleton + chain
// rewriting in isolation; these specs lock the COMPOSITION the
// showcase depends on: a `beforeEnter` guard reading store state
// compiles into the dispatcher's inline conditional, store writes
// lower to plain assignment from ANY component, and `<For>` iterates
// a store-held list directly. This is the cross-screen-state shape
// `rememberPyreonStorage` could not provide (per-composable), so the
// store IS the canonical channel — keep these green.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const STORE_AUTH_APP = `
  import { defineStore } from '@pyreon/store'
  import { signal } from '@pyreon/reactivity'
  import { For } from '@pyreon/core'
  import { Stack, Text, Button } from '@pyreon/primitives'
  import { createRouter, useNavigate, RouterProvider, RouterView } from '@pyreon/router'

  type Task = { id: number; title: string; done: boolean }

  const useApp = defineStore('app', () => {
    const isAuthed = signal(false)
    const tasks = signal<Task[]>([{ id: 1, title: 'First', done: false }])
    return { isAuthed, tasks }
  })

  function LoginPage() {
    const navigate = useNavigate()
    const login = () => {
      useApp().store.isAuthed.set(true)
      navigate('/tasks')
    }
    return <Stack><Button onPress={login}>Continue</Button></Stack>
  }

  function TasksPage() {
    const toggle = (id: number) => {
      useApp().store.tasks.set(useApp().store.tasks().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
    }
    return (
      <Stack>
        <For each={useApp().store.tasks} by={(t) => t.id}>
          {(t) => <Text>{t.title}</Text>}
        </For>
      </Stack>
    )
  }

  export function App() {
    const router = createRouter({
      routes: [
        { path: '/', component: LoginPage },
        { path: '/tasks', component: TasksPage, beforeEnter: () => useApp().store.isAuthed() },
      ],
    })
    return <RouterProvider router={router}><RouterView /></RouterProvider>
  }
`

describe('store-backed route guard — Swift', () => {
  it('beforeEnter reading store state compiles into the dispatcher conditional', () => {
    const out = transform(STORE_AUTH_APP, { target: 'swift' }).code
    expect(out).toContain('if PyreonStore_app.shared.isAuthed {')
    expect(out).toContain('TasksPage()')
    // Denied path renders the catch-all denial, never the gated view.
    expect(out).toContain('Pyreon Router: access denied')
  })

  it('store write from a screen lowers to assignment on the singleton', () => {
    const out = transform(STORE_AUTH_APP, { target: 'swift' }).code
    expect(out).toContain('PyreonStore_app.shared.isAuthed = true')
  })

  it('store list mutation + For-over-store lower through the singleton', () => {
    const out = transform(STORE_AUTH_APP, { target: 'swift' }).code
    expect(out).toContain(
      'PyreonStore_app.shared.tasks = PyreonStore_app.shared.tasks.map(',
    )
    expect(out).toContain('ForEach(PyreonStore_app.shared.tasks, id: \\.id)')
  })
})

describe('store-backed route guard — Kotlin (mirror)', () => {
  it('beforeEnter reading store state compiles into the dispatcher conditional', () => {
    const out = transform(STORE_AUTH_APP, { target: 'kotlin' }).code
    expect(out).toContain('if (PyreonStore_app.isAuthed) TasksPage()')
    expect(out).toContain('Pyreon Router: access denied')
  })

  it('store write from a screen lowers to assignment on the object', () => {
    const out = transform(STORE_AUTH_APP, { target: 'kotlin' }).code
    expect(out).toContain('PyreonStore_app.isAuthed = true')
  })

  it('store list mutation + For-over-store lower through the object', () => {
    const out = transform(STORE_AUTH_APP, { target: 'kotlin' }).code
    expect(out).toContain('PyreonStore_app.tasks = PyreonStore_app.tasks.map(')
    expect(out).toContain('items(PyreonStore_app.tasks, key = { it.id })')
  })
})
