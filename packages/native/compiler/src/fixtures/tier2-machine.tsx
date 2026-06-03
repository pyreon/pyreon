// Tier-2 verification fixture for @pyreon/machine.
//
// machine exposes `createMachine({ initial, states })` which returns
// a constrained signal-like value with `.send(event)` / `.matches(state)`
// / `.can(event)` / `.nextEvents()` methods.
//
// The audit theory: machine is a thin wrapper over signals + state
// transitions, both compile cleanly via PMTC, ergo machine should too.
//
// Pre-verification finding (see tier2-machine-emit-broken.test.ts):
// PMTC silently drops the `createMachine(...)` declaration but KEEPS
// the `m.send(...)` / `m.matches(...)` call sites. The emit produces
// code that references undefined `m` — a hard swiftc/kotlinc error
// rather than rx's silent-drop (which was at least syntactically valid).
//
// This is worse than rx in one way (the emit is structurally broken,
// not just behaviourally wrong) and better in another (the bug is loud,
// not silent).

import { createMachine } from '@pyreon/machine'

export function LoaderProbe() {
  const m = createMachine({
    initial: 'idle' as const,
    states: {
      idle: { on: { FETCH: 'loading' } },
      loading: { on: { SUCCESS: 'done', ERROR: 'error' } },
      done: {},
      error: { on: { RETRY: 'loading' } },
    },
  })

  // Bare method calls — `m` is used (via .send / .matches), so no
  // unused-vars findings. PMTC drops the createMachine binding but
  // preserves these call sites, producing structurally-broken emit
  // that references undefined `m` (the bug this fixture documents).
  m.send('FETCH')
  m.send('SUCCESS')
  m.matches('loading')

  return null
}
