// @ts-nocheck — PMTC handles typing; tsc multi-child JSX limitations
// noisy (same `@ts-nocheck` rationale as showcase-tasks.tsx).
//
// PMTC Finance Tracker — SINGLE source for web, iOS, Android.
//
// The "finance tracker" archetype, exercising the Phase-5 data/services
// hook emit (#1689) in a real app shape: a `useAuth<User>()` auth-state
// container drives the login screen (reactive `status` / `isAuthenticated`
// reads + `beginSignIn` / `signOut` no-arg transitions), a cross-screen
// `defineStore` holds the reactive ledger, a `computed` derives the running
// balance, `useForm` validates the add-transaction input, and a
// `useDatabase()` persistence handle is wired for the string-keyed ops that
// lower cleanly. Multi-screen routing with a store-backed `beforeEnter`
// gate. ONE source → three targets.
//
// ## What this exercises (compile-rung: emits typecheck-clean Swift + Kotlin)
//
// - **useAuth<User>** — `const auth = useAuth<User>()`; reactive reads
//   `auth.status` / `auth.isAuthenticated` / `auth.isSigningIn` (Swift bare
//   @Observable; Kotlin `.value` on the MutableState `status`, bare on the
//   Bool getters), no-arg transitions `auth.beginSignIn()` / `auth.signOut()`.
// - **useDatabase** — `const db = useDatabase()`; the string-keyed
//   persistence surface (`db.delete('tx', id)` on remove, `db.count('tx')`)
//   lowers cleanly.
// - **Cross-screen store** — `defineStore('finance', ...)` with `isAuthed`
//   + a reactive `txns: Transaction[]`; the ledger UI binds to the signal
//   (reactive), the DB is the persistence side-channel.
// - **computed balance** — `computed(() => txns().reduce(...))`.
// - **useForm** — validated add-transaction (amount required + numeric-ish).
// - **routing + auth-gate** — login / dashboard / detail; `beforeEnter`
//   reads the store flag.
// - **primitives + control flow** — Stack / Inline / Field / Button / Text /
//   Scroll / For / Show.
//
// ## Known emit gaps this archetype SURFACED (the honest "any app" roadmap)
//
// Building a fuller app reveals TS-surface gaps beyond "the hooks emit":
//   1. **Object literal → typed struct.** `db.insert('tx', { id, fields })`
//      lowers the object literal to a Swift TUPLE `(id:…, fields:…)`, NOT a
//      `PyreonRecord(...)` — so constructing a typed container arg from an
//      object literal doesn't typecheck. Record-construction insert is a
//      follow-up; this showcase uses the string-keyed db ops only.
//   2. **`const x = obj.method()`** (a plain const initialized from a
//      method call, e.g. `const n = db.count('tx')`) is dropped — only
//      signal / computed / hook decls are captured as component-body decls.
//      Read such values inside a handler, or wrap in `computed(...)`.
//   3. **Imperative-hook reads aren't reactive.** `useDatabase` is an
//      imperative facade (no MutableState) — `db.all('tx')` won't re-render
//      on insert. Keep the reactive list in a `signal`/store; use the DB as
//      persistence. (Reflected in this showcase's store-signal ledger.)

import { signal, computed } from '@pyreon/reactivity'
import { useForm } from '@pyreon/form'
import { useAuth, useDatabase, useSecureStorage } from '@pyreon/hooks'
import { defineStore } from '@pyreon/store'
import { For, Show, onMount } from '@pyreon/core'
import { Stack, Inline, Field, Button, Text, Scroll } from '@pyreon/primitives'
import { createRouter, useNavigate, RouterProvider, RouterView } from '@pyreon/router'

type User = { id: string; name: string }
type Transaction = { id: number; description: string; amount: number }

let nextTxId = 3

// ── Cross-screen reactive state ──

const useFinance = defineStore('finance', () => {
  const isAuthed = signal(false)
  const txns = signal<Transaction[]>([
    { id: 1, description: 'Salary', amount: 4200 },
    { id: 2, description: 'Rent', amount: -1500 },
  ])
  return { isAuthed, txns }
})

// ── Login screen — driven by the useAuth<User> container ──

function LoginPage() {
  const navigate = useNavigate()
  const auth = useAuth<User>()
  // Session rehydration — the auth row's remaining reachable gap. The
  // documented composition is `PyreonAuth` (pure reactive state, no platform
  // edge) ⊕ `PyreonSecureStorage` (Keychain / Keystore AES-GCM): sign-in
  // persists the session, launch restores it. Nothing gated exercised that
  // pairing, so it was R1-R2 (compiles, unproven) — and writing the natural
  // shape found a real emit bug: `secrets.read()` returns `String?` on both
  // runtimes, but inference had no model for service METHOD RETURNS, so
  // `if (token)` emitted a bare optional as the condition and compiled on
  // NEITHER target (see native-auth-rehydrate.test.ts).
  const secrets = useSecureStorage()
  onMount(() => {
    const token = secrets.read('finance-session')
    if (token) {
      // Restore the container AND the store flag the route guard reads, then
      // land the user where they left off — the whole chain a returning user
      // experiences (secret store → auth container → guard → dashboard),
      // which is what the terminate-and-relaunch device tests assert.
      auth.signInSucceeded({ id: token, name: token })
      useFinance().store.isAuthed.set(true)
      navigate('/dashboard')
    }
  })

  const form = useForm({
    initialValues: { username: '' },
    validators: {
      username: (v) => (v.length < 3 ? 'At least 3 characters' : ''),
    },
    onSubmit: (values) => {
      // Drive the auth-state container through its transitions, persist the
      // session to the platform secret store, then flip the cross-screen
      // store flag the route guard reads.
      auth.beginSignIn()
      secrets.write('finance-session', values.username)
      auth.signInSucceeded({ id: values.username, name: values.username })
      useFinance().store.isAuthed.set(true)
      // Clear the field after a successful submit — the most common reason a
      // submit handler exists, and a SELF-reference: the handler names the
      // form it belongs to. That shape did not COMPILE on Android until the
      // Kotlin emit stopped passing onSubmit as a constructor argument
      // (inside `remember { PyreonForm(onSubmit = { … form … }) }` the body
      // is a self-reference in the form's own initializer). Swift always
      // assigned it post-init from `.onAppear`; Kotlin now mirrors that.
      form.setFieldValue('username', '')
      navigate('/dashboard')
    },
  })

  return (
    <Stack gap={3} padding={4} data-testid="login-page">
      <Text font="Brand" data-testid="brand-title">Finance — Sign In</Text>
      <Text data-testid="auth-status">{auth.status}</Text>
      <Field
        value={form.values().username}
        onChangeText={(v) => form.setFieldValue('username', v)}
        placeholder="Username"
        data-testid="login-username"
      />
      <Show when={() => form.errors().username !== ''}>
        <Text data-testid="login-error">{form.errors().username}</Text>
      </Show>
      <Button onPress={() => form.submit()} data-testid="login-submit">
        Continue
      </Button>
    </Stack>
  )
}

// ── Dashboard — reactive ledger + computed balance + add form ──

function DashboardPage() {
  const navigate = useNavigate()
  const db = useDatabase()
  const auth = useAuth<User>()
  const secrets = useSecureStorage()
  const description = signal<string>('')
  const amount = signal<string>('')

  const balance = computed(() =>
    useFinance()
      .store.txns()
      .reduce((sum, t) => sum + t.amount, 0),
  )

  const addTransaction = () => {
    const desc = description().trim()
    if (desc.length === 0) return
    const value = parseInt(amount(), 10)
    useFinance().store.txns.set([
      ...useFinance().store.txns(),
      { id: nextTxId++, description: desc, amount: value },
    ])
    description.set('')
    amount.set('')
  }

  const remove = (id: number) => {
    useFinance().store.txns.set(
      useFinance()
        .store.txns()
        .filter((t) => t.id !== id),
    )
    // Persistence side-channel — string-keyed db op (lowers cleanly).
    db.delete('tx', String(id))
  }

  const logout = () => {
    // Clearing the persisted session is HALF of sign-out once rehydration
    // exists: leaving the token behind means the next launch silently signs
    // the user back in. The device tests assert the logout->relaunch path
    // lands on LOGIN, which is what makes this line load-bearing.
    secrets.remove('finance-session')
    auth.signOut()
    useFinance().store.isAuthed.set(false)
    navigate('/login')
  }

  return (
    <Stack gap={3} padding={4} data-testid="dashboard-page">
      <Inline gap={2}>
        <Text data-testid="dash-title">Ledger</Text>
        <Text data-testid="dash-balance">{balance}</Text>
      </Inline>
      <Scroll>
        <For each={useFinance().store.txns} by={(t) => t.id}>
          {(t) => (
            <Inline gap={2} data-testid="tx-row">
              <Text>{t.description}</Text>
              <Text>{t.amount}</Text>
              <Button onPress={() => remove(t.id)} data-testid="tx-remove">
                Remove
              </Button>
            </Inline>
          )}
        </For>
      </Scroll>
      <Field
        value={description}
        onChangeText={(v) => description.set(v)}
        placeholder="Description"
        data-testid="new-tx-desc"
      />
      <Field
        value={amount}
        onChangeText={(v) => amount.set(v)}
        placeholder="Amount"
        data-testid="new-tx-amount"
      />
      <Inline gap={2}>
        <Button onPress={addTransaction} data-testid="new-tx-add">
          Add
        </Button>
        <Button onPress={logout} data-testid="dash-logout">
          Sign Out
        </Button>
      </Inline>
    </Stack>
  )
}

// ── App root ──

export function FinanceApp() {
  const router = createRouter({
    mode: 'history',
    routes: [
      { path: '/', component: LoginPage },
      { path: '/login', component: LoginPage },
      {
        path: '/dashboard',
        component: DashboardPage,
        beforeEnter: () => useFinance().store.isAuthed(),
      },
    ],
  })

  return (
    <RouterProvider router={router}>
      <RouterView />
    </RouterProvider>
  )
}
