/**
 * @pyreon/machine vs XState and Robot (robot3).
 *
 * Run: `bun run bench:rivals` (from packages/fundamentals/machine). Harness and
 * measurement contract: `scripts/bench/rivals-harness.ts` (one process per
 * op × arm × round, cluster-bootstrap CI95 over processes, gate before timing).
 *
 * Same machine in every arm: off ⇄ on via TOGGLE, plus FINISH from `on` guarded
 * on the event payload (`ok === true`).
 *
 * Idiomatic per library:
 *  - Pyreon: `createMachine({ initial, states })`; the instance is the reactive
 *    state (`m()`), `m.send(event, payload)`, `m.can`, `m.matches`.
 *  - XState: `createMachine(config)` once, `createActor(machine).start()` per
 *    instance, reads through `getSnapshot()`.
 *    https://stately.ai/docs/actors#creating-actors
 *  - Robot: `createMachine({ off: state(transition(...)), ... })` once and
 *    `interpret(machine, onChange)` per instance; `service.send(event)` and
 *    `service.machine.current` for the current state; guards via `guard(fn)`
 *    reading the event object. https://thisrobot.life/api/interpret.html
 *
 * `can` is skipped for Robot: it has no documented API that asks whether an
 * event would be accepted (the transitions map on `machine.state.value` is
 * internal). Every arm's create, send and matches return the same states
 * (gate below).
 */
import { createActor, createMachine as createXstateMachine } from 'xstate'
import { createMachine as createRobotMachine, guard, interpret, state, transition } from 'robot3'
import { runRivalBench, type Arm } from '../../../../scripts/bench/rivals-harness'
import { createMachine as createPyreonMachine } from '../src/index'

type Id = 'pyreon' | 'xstate' | 'robot3'
const ARMS: readonly Arm<Id>[] = [
  { id: 'pyreon', label: 'Pyreon' },
  { id: 'xstate', label: 'XState', pkg: 'xstate' },
  { id: 'robot3', label: 'Robot (robot3)', pkg: 'robot3' },
]

let sink = 0

const PYR_CONFIG = {
  initial: 'off',
  states: {
    off: { on: { TOGGLE: 'on' } },
    on: {
      on: {
        TOGGLE: 'off',
        FINISH: { target: 'off', guard: (p?: unknown) => (p as { ok?: boolean })?.ok === true },
      },
    },
  },
} as const

const XSTATE_MACHINE = createXstateMachine({
  initial: 'off',
  states: {
    off: { on: { TOGGLE: 'on' } },
    on: {
      on: {
        TOGGLE: 'off',
        FINISH: { target: 'off', guard: ({ event }) => (event as { ok?: boolean }).ok === true },
      },
    },
  },
})

const ROBOT_MACHINE = createRobotMachine({
  off: state(transition('TOGGLE', 'on')),
  on: state(
    transition('TOGGLE', 'off'),
    transition(
      'FINISH',
      'off',
      guard((_ctx: unknown, ev: { ok?: boolean }) => ev.ok === true),
    ),
  ),
})

/** Uniform view so the gate and the ops drive every arm the same way. */
interface Inst {
  value: () => string
  send: (type: 'TOGGLE' | 'FINISH', ok?: boolean) => void
  matches: (s: string) => boolean
  can?: (ok: boolean) => boolean
}

const make: Record<Id, () => Inst> = {
  pyreon: () => {
    const m = createPyreonMachine(PYR_CONFIG)
    return {
      value: () => m(),
      send: (type, ok) => (ok === undefined ? m.send(type) : m.send(type, { ok })),
      matches: (s) => m.matches(s as 'off'),
      can: (ok) => m.can('FINISH', { ok }),
    }
  },
  xstate: () => {
    const a = createActor(XSTATE_MACHINE).start()
    return {
      value: () => a.getSnapshot().value as string,
      send: (type, ok) => a.send(ok === undefined ? { type } : ({ type, ok } as { type: 'FINISH' })),
      matches: (s) => a.getSnapshot().matches(s as 'off'),
      can: (ok) => a.getSnapshot().can({ type: 'FINISH', ok } as { type: 'FINISH' }),
    }
  },
  robot3: () => {
    const s = interpret(ROBOT_MACHINE, () => {})
    return {
      value: () => s.machine.current,
      send: (type, ok) => s.send(ok === undefined ? type : ({ type, ok } as unknown as string)),
      matches: (st) => s.machine.current === st,
    }
  },
}

await runRivalBench<Id>({
  title: '@pyreon/machine vs XState / Robot',
  file: import.meta.path,
  pyreon: 'pyreon',
  arms: ARMS,
  sink: () => sink,
  ops: {
    'create (instance)': {
      note: 'XState: actor from a shared machine; Robot: interpret() of a shared machine; Pyreon: createMachine(config)',
      make: (id) => {
        // Call the library directly (not through the Inst adapter) so the
        // timed region holds only the library's own instance construction.
        if (id === 'pyreon')
          return () => {
            sink += createPyreonMachine(PYR_CONFIG)() === 'off' ? 1 : 0
          }
        if (id === 'xstate')
          return () => {
            sink += createActor(XSTATE_MACHINE).start().getSnapshot().value === 'off' ? 1 : 0
          }
        return () => {
          sink += interpret(ROBOT_MACHINE, () => {}).machine.current === 'off' ? 1 : 0
        }
      },
    },
    'send (transition)': {
      make: (id) => {
        if (id === 'pyreon') {
          const m = createPyreonMachine(PYR_CONFIG)
          return () => {
            m.send('TOGGLE')
            sink += m() === 'on' ? 1 : 0
          }
        }
        if (id === 'xstate') {
          const a = createActor(XSTATE_MACHINE).start()
          return () => {
            a.send({ type: 'TOGGLE' })
            sink += a.getSnapshot().value === 'on' ? 1 : 0
          }
        }
        const s = interpret(ROBOT_MACHINE, () => {})
        return () => {
          s.send('TOGGLE')
          sink += s.machine.current === 'on' ? 1 : 0
        }
      },
    },
    'can (guard eval)': {
      skip: { robot3: 'no documented "would this event be accepted" API' },
      make: (id) => {
        if (id === 'pyreon') {
          const m = createPyreonMachine(PYR_CONFIG)
          m.send('TOGGLE')
          return () => {
            sink += m.can('FINISH', { ok: true }) ? 1 : 0
          }
        }
        const a = createActor(XSTATE_MACHINE).start()
        a.send({ type: 'TOGGLE' })
        return () => {
          sink += a.getSnapshot().can({ type: 'FINISH', ok: true } as { type: 'FINISH' }) ? 1 : 0
        }
      },
    },
    matches: {
      make: (id) => {
        if (id === 'pyreon') {
          const m = createPyreonMachine(PYR_CONFIG)
          return () => {
            sink += m.matches('off') ? 1 : 0
          }
        }
        if (id === 'xstate') {
          const a = createActor(XSTATE_MACHINE).start()
          return () => {
            sink += a.getSnapshot().matches('off') ? 1 : 0
          }
        }
        const s = interpret(ROBOT_MACHINE, () => {})
        return () => {
          sink += s.machine.current === 'off' ? 1 : 0
        }
      },
    },
  },
  gate: () => {
    for (const arm of ARMS) {
      const i = make[arm.id]()
      const fail = (what: string) => {
        throw new Error(`[correctness] ${arm.label}: ${what} (state ${i.value()})`)
      }
      if (i.value() !== 'off' || !i.matches('off')) fail('initial off')
      i.send('TOGGLE')
      if (i.value() !== 'on' || i.matches('off')) fail('TOGGLE → on')
      if (i.can && (i.can(true) !== true || i.can(false) !== false)) fail('can(FINISH)')
      i.send('FINISH', false)
      if (i.value() !== 'on') fail('guard rejects ok:false')
      i.send('FINISH', true)
      if (i.value() !== 'off') fail('guarded FINISH → off')
    }
  },
})
