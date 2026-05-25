import { createMachine } from '@pyreon/machine'

/**
 * Submission state machine — exercises `@pyreon/machine`.
 *
 * Transitions:
 *   idle → submitting (via SUBMIT)
 *   submitting → success (via DONE)
 *   submitting → error (via FAIL)
 *   success | error → idle (via RESET)
 *
 * Used by the /submit page to model the multi-step submit flow without
 * juggling 4 boolean signals (`isSubmitting`, `isSuccess`, `isError`,
 * `lastError`) that have to stay consistent.
 */
export const createSubmitMachine = () =>
  createMachine({
    initial: 'idle' as const,
    states: {
      idle: { on: { SUBMIT: 'submitting' } },
      submitting: { on: { DONE: 'success', FAIL: 'error' } },
      success: { on: { RESET: 'idle' } },
      error: { on: { RESET: 'idle' } },
    },
  })
