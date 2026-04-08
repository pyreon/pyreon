import { createMachine } from '@pyreon/machine'

/**
 * Wizard step state machine.
 *
 * The wizard advances through four steps and a terminal `success`
 * state. Each transition lists exactly the events the current step
 * accepts — invalid events (e.g. NEXT from `success`) are silently
 * ignored by `machine.send()`.
 *
 * Why a state machine instead of a `step: signal<number>`:
 *   • Type-safe transitions — `machine.send('NEXT')` only compiles
 *     for events the current state actually accepts.
 *   • `matches('account')` reads more clearly than `step() === 0`.
 *   • Adding a SUBMIT_ERROR retry path later is one new state, not a
 *     branching condition every action site has to know about.
 */
export const wizardMachine = createMachine({
  initial: 'account' as const,
  states: {
    account: {
      on: { NEXT: 'profile' },
    },
    profile: {
      on: { NEXT: 'preferences', PREV: 'account' },
    },
    preferences: {
      on: { NEXT: 'review', PREV: 'profile' },
    },
    review: {
      on: { PREV: 'preferences', SUBMIT: 'submitting' },
    },
    submitting: {
      on: { DONE: 'success', FAIL: 'review' },
    },
    success: {
      on: { RESET: 'account' },
    },
  },
})

/** All wizard steps in display order — used by the stepper UI. */
export const STEPS = ['account', 'profile', 'preferences', 'review'] as const
export type Step = (typeof STEPS)[number]

export const STEP_LABELS: Record<Step, string> = {
  account: 'Account',
  profile: 'Profile',
  preferences: 'Preferences',
  review: 'Review',
}

/** Index of a step in the STEPS array — used to highlight the stepper. */
export function stepIndex(step: string): number {
  const i = STEPS.indexOf(step as Step)
  return i < 0 ? 0 : i
}
