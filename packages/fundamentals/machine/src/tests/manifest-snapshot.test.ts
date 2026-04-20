import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — machine snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/machine — Reactive state machines — constrained signals with type-safe transitions. Unlike XState, Pyreon machines have no built-in context. Use regular signals alongside the machine for associated data — the machine handles the state transitions, signals handle the data."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/machine — State Machines

      Lightweight state machine library built on Pyreon signals. A machine is a constrained signal — it can only hold values from the configured state set and can only transition between them via named events. Guards enable conditional transitions with optional payloads. There is no built-in context or side-effect system — use existing Pyreon signals alongside the machine for data and effects. The machine reads like a signal and subscribes like one, making it natural in JSX and reactive scopes.

      \`\`\`typescript
      import { createMachine } from '@pyreon/machine'

      // Define states and transitions — type-safe:
      const machine = createMachine({
        initial: 'idle',
        states: {
          idle: {
            on: { FETCH: 'loading' },
          },
          loading: {
            on: {
              SUCCESS: 'done',
              ERROR: 'error',
            },
          },
          done: {},
          error: {
            on: { RETRY: 'loading' },
          },
        },
      })

      // Read state — works like a signal:
      machine()              // 'idle'

      // Transition via events:
      machine.send('FETCH')  // → 'loading'
      machine.send('SUCCESS') // → 'done'

      // Query capabilities:
      machine.matches('done')          // true
      machine.matches('idle', 'done')  // true — matches any of the listed states
      machine.can('RETRY')             // false — not in 'error' state
      machine.nextEvents()             // [] — 'done' has no transitions

      // Guards — conditional transitions:
      const auth = createMachine({
        initial: 'loggedOut',
        states: {
          loggedOut: {
            on: {
              LOGIN: {
                target: 'loggedIn',
                guard: (creds: { token: string }) => creds.token.length > 0,
              },
            },
          },
          loggedIn: {
            on: { LOGOUT: 'loggedOut' },
          },
        },
      })

      auth.send('LOGIN', { token: 'abc' }) // guard passes → 'loggedIn'
      auth.send('LOGIN', { token: '' })    // guard fails → stays 'loggedOut'

      // Use in JSX — reactive:
      const Status = () => (
        <div>
          {() => machine.matches('loading') && <Spinner />}
          {() => machine.matches('error') && <ErrorMessage />}
          {() => machine.matches('done') && <Results />}
        </div>
      )
      \`\`\`

      > **No context**: Unlike XState, Pyreon machines have no built-in context. Use regular signals alongside the machine for associated data — the machine handles the state transitions, signals handle the data.
      >
      > **Guard failures are silent**: If a guard returns false, the transition simply does not happen — no error is thrown, no event is emitted. Check \`machine.can(event)\` before sending if you need to handle the rejection.
      >
      > **Signal compatibility**: The machine reads like a signal (\`machine()\`) and subscribes like one — it works in \`effect()\`, \`computed()\`, and JSX expression thunks without special handling.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(1)
    expect(record['machine/createMachine']!.notes).toContain('type-safe')
    expect(record['machine/createMachine']!.mistakes?.split('\n').length).toBe(4)
  })
})
