import { createMachine } from '@pyreon/machine'
import { signal } from '@pyreon/reactivity'

// ─── Wizard Machine ─────────────────────────────────────────────────────────

const wizard = createMachine({
  initial: 'step1',
  states: {
    step1: { on: { NEXT: 'step2' } },
    step2: { on: { NEXT: 'step3', BACK: 'step1' } },
    step3: { on: { SUBMIT: 'submitting', BACK: 'step2' } },
    submitting: { on: { SUCCESS: 'done', ERROR: 'step3' } },
    done: {},
  },
})

// ─── Fetch Machine ──────────────────────────────────────────────────────────

const fetcher = createMachine({
  initial: 'idle',
  states: {
    idle: { on: { FETCH: 'loading' } },
    loading: { on: { SUCCESS: 'success', ERROR: 'error' } },
    success: { on: { REFETCH: 'loading', RESET: 'idle' } },
    error: { on: { RETRY: 'loading', RESET: 'idle' } },
  },
})

const fetchData = signal<string | null>(null)
const fetchError = signal<string | null>(null)

fetcher.onEnter('loading', () => {
  fetchData.set(null)
  fetchError.set(null)
  // Simulate API call
  setTimeout(() => {
    if (Math.random() > 0.3) {
      fetchData.set(`Data loaded at ${new Date().toLocaleTimeString()}`)
      fetcher.send('SUCCESS')
    } else {
      fetchError.set('Network error (simulated 30% failure rate)')
      fetcher.send('ERROR')
    }
  }, 800)
})

// ─── Toggle Machine ─────────────────────────────────────────────────────────

const toggle = createMachine({
  initial: 'off',
  states: {
    off: { on: { TOGGLE: 'on' } },
    on: { on: { TOGGLE: 'off' } },
  },
})

// ─── Player Machine ─────────────────────────────────────────────────────────

const player = createMachine({
  initial: 'stopped',
  states: {
    stopped: { on: { PLAY: 'playing' } },
    playing: { on: { PAUSE: 'paused', STOP: 'stopped' } },
    paused: { on: { PLAY: 'playing', STOP: 'stopped' } },
  },
})

// ─── Guarded Machine ────────────────────────────────────────────────────────

const formValid = signal(false)

const guardedForm = createMachine({
  initial: 'editing',
  states: {
    editing: {
      on: {
        SUBMIT: { target: 'submitting', guard: () => formValid.peek() },
      },
    },
    submitting: { on: { SUCCESS: 'done', ERROR: 'editing' } },
    done: { on: { RESTART: 'editing' } },
  },
})

export function MachineDemo() {
  const transitionLog = signal<string[]>([])

  // Log all wizard transitions
  wizard.onTransition((from, to, event) => {
    transitionLog.update((l) => [...l.slice(-14), `${event.type}: ${from} → ${to}`])
  })

  fetcher.onTransition((from, to, event) => {
    transitionLog.update((l) => [...l.slice(-14), `[fetch] ${event.type}: ${from} → ${to}`])
  })

  return (
    <div>
      <h2>Machine</h2>
      <p class="desc">
        Reactive state machines — constrained signals with type-safe transitions. A machine can only
        hold specific values and can only change via specific events. No impossible states, no
        nested booleans.
      </p>

      {/* Wizard */}
      <div class="section">
        <h3>Multi-Step Wizard</h3>
        <p style="margin-bottom: 8px">
          State: <strong>{() => wizard()}</strong> | Available events:{' '}
          <code>{() => wizard.nextEvents().join(', ') || '(none)'}</code>
        </p>

        {() => {
          if (wizard.matches('step1'))
            return (
              <div style="padding: 16px; background: #f0f9ff; border-radius: 8px">
                <h4>Step 1: Personal Info</h4>
                <p>Name, email, phone...</p>
                <button onClick={() => wizard.send('NEXT')}>Next</button>
              </div>
            )
          if (wizard.matches('step2'))
            return (
              <div style="padding: 16px; background: #f0fdf4; border-radius: 8px">
                <h4>Step 2: Preferences</h4>
                <p>Theme, language, notifications...</p>
                <div class="row">
                  <button onClick={() => wizard.send('BACK')}>Back</button>
                  <button onClick={() => wizard.send('NEXT')}>Next</button>
                </div>
              </div>
            )
          if (wizard.matches('step3'))
            return (
              <div style="padding: 16px; background: #fefce8; border-radius: 8px">
                <h4>Step 3: Confirm</h4>
                <p>Review and submit your data.</p>
                <div class="row">
                  <button onClick={() => wizard.send('BACK')}>Back</button>
                  <button onClick={() => wizard.send('SUBMIT')}>Submit</button>
                </div>
              </div>
            )
          if (wizard.matches('submitting'))
            return (
              <div style="padding: 16px; background: #faf5ff; border-radius: 8px">
                <h4>Submitting...</h4>
                <div class="row">
                  <button onClick={() => wizard.send('SUCCESS')}>Simulate Success</button>
                  <button onClick={() => wizard.send('ERROR')}>Simulate Error</button>
                </div>
              </div>
            )
          if (wizard.matches('done'))
            return (
              <div style="padding: 16px; background: #f0fdf4; border-radius: 8px">
                <h4>Done!</h4>
                <p>Wizard completed successfully.</p>
                <button onClick={() => wizard.reset()}>Start Over</button>
              </div>
            )
          return null
        }}
      </div>

      {/* Fetch */}
      <div class="section">
        <h3>Async Fetch (with onEnter)</h3>
        <p style="margin-bottom: 8px">
          State: <strong>{() => fetcher()}</strong>
        </p>

        {() => {
          if (fetcher.matches('idle'))
            return <button onClick={() => fetcher.send('FETCH')}>Fetch Data</button>
          if (fetcher.matches('loading')) return <p>Loading... (30% chance of simulated error)</p>
          if (fetcher.matches('success'))
            return (
              <div>
                <p style="color: green">{fetchData()}</p>
                <div class="row">
                  <button onClick={() => fetcher.send('REFETCH')}>Refetch</button>
                  <button onClick={() => fetcher.send('RESET')}>Reset</button>
                </div>
              </div>
            )
          if (fetcher.matches('error'))
            return (
              <div>
                <p style="color: red">{fetchError()}</p>
                <div class="row">
                  <button onClick={() => fetcher.send('RETRY')}>Retry</button>
                  <button onClick={() => fetcher.send('RESET')}>Reset</button>
                </div>
              </div>
            )
          return null
        }}
      </div>

      {/* Toggle */}
      <div class="section">
        <h3>Simple Toggle</h3>
        <div class="row">
          <button onClick={() => toggle.send('TOGGLE')}>
            {() => (toggle.matches('on') ? 'Turn Off' : 'Turn On')}
          </button>
          <span>
            State: <strong>{() => toggle()}</strong>
          </span>
        </div>
      </div>

      {/* Player */}
      <div class="section">
        <h3>Media Player</h3>
        <p style="margin-bottom: 8px">
          State: <strong>{() => player()}</strong>
        </p>
        <div class="row">
          <button type="button" onClick={() => player.send('PLAY')} disabled={!player.can('PLAY')}>
            Play
          </button>
          <button
            type="button"
            onClick={() => player.send('PAUSE')}
            disabled={!player.can('PAUSE')}
          >
            Pause
          </button>
          <button type="button" onClick={() => player.send('STOP')} disabled={!player.can('STOP')}>
            Stop
          </button>
        </div>
        <p style="font-size: 13px; opacity: 0.7; margin-top: 4px">
          Buttons auto-disable based on <code>machine.can(event)</code> — no manual disabled logic
          needed.
        </p>
      </div>

      {/* Guarded */}
      <div class="section">
        <h3>Guarded Transitions</h3>
        <p style="margin-bottom: 8px">
          State: <strong>{() => guardedForm()}</strong>
        </p>

        {() => {
          if (guardedForm.matches('editing'))
            return (
              <div>
                <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px">
                  <input
                    type="checkbox"
                    checked={formValid()}
                    onChange={() => formValid.update((v) => !v)}
                  />
                  Form is valid (guard checks this)
                </label>
                <button onClick={() => guardedForm.send('SUBMIT')}>Submit</button>
                <p style="font-size: 13px; opacity: 0.7; margin-top: 4px">
                  {() =>
                    formValid()
                      ? 'Guard will pass — click Submit.'
                      : 'Guard will block — Submit does nothing until checkbox is checked.'
                  }
                </p>
              </div>
            )
          if (guardedForm.matches('submitting'))
            return (
              <div>
                <p>Submitting...</p>
                <button onClick={() => guardedForm.send('SUCCESS')}>Complete</button>
              </div>
            )
          if (guardedForm.matches('done'))
            return (
              <div>
                <p style="color: green">Form submitted successfully!</p>
                <button onClick={() => guardedForm.send('RESTART')}>Restart</button>
              </div>
            )
          return null
        }}
      </div>

      {/* Transition Log */}
      <div class="section">
        <h3>Transition Log</h3>
        <div class="log" style="min-height: 100px">
          {() =>
            transitionLog().length === 0
              ? 'Interact with the machines above to see transitions.'
              : transitionLog().join('\n')
          }
        </div>
      </div>
    </div>
  )
}
