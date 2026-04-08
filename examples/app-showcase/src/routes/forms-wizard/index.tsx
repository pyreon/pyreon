import { onMount, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { AccountStep } from '../../sections/wizard/AccountStep'
import { PreferencesStep } from '../../sections/wizard/PreferencesStep'
import { ProfileStep } from '../../sections/wizard/ProfileStep'
import { ReviewStep } from '../../sections/wizard/ReviewStep'
import {
  NavNext,
  PatchLog,
  StepBubble,
  StepLabel,
  Stepper,
  StepperItem,
  SuccessCard,
  SuccessIcon,
  SuccessText,
  SuccessTitle,
  WizardLead,
  WizardPage,
  WizardTitle,
} from '../../sections/wizard/styled'
import { STEP_LABELS, STEPS, type Step, stepIndex, wizardMachine } from '../../sections/wizard/wizardMachine'
import { snapshotWizard, trackPatches, useWizard } from '../../sections/wizard/wizardModel'

/**
 * Forms Wizard section — multi-step onboarding form.
 *
 * Demonstrates four fundamentals packages working together:
 *   • @pyreon/form        — useForm + register pattern, one form per step
 *   • @pyreon/validation  — Zod schemas validate each step on blur
 *   • @pyreon/state-tree  — model holds collected data across steps
 *                            with snapshots (Review reads them) and
 *                            patches (the bottom log counts edits)
 *   • @pyreon/machine     — typed transitions with NEXT/PREV/SUBMIT
 *                            events; the route reacts to state changes
 *                            via `matches('account' | 'profile' | …)`
 *
 * Why a state machine over `step: signal<number>`:
 *   • `machine.send('SUBMIT')` is only valid in the `review` state
 *     (compile-time + runtime guard).
 *   • Adding a `submitting → fail → review` retry loop later is
 *     one new state, not a branching condition every action site
 *     has to know about.
 */
export default function FormsWizardRoute() {
  const wizard = useWizard()
  const patchCount = signal(0)

  // Subscribe to state-tree patches so we can show the running count
  // in the bottom audit log. Cleanup is registered with the component
  // so the listener disposes on unmount.
  onMount(() => {
    const unsubscribe = trackPatches(wizard, (n) => patchCount.set(n))
    onUnmount(unsubscribe)
  })

  // ── Fake "create account" call ─────────────────────────────────────
  // Uses `wizardMachine.onEnter('submitting', …)` so the side-effect
  // is colocated with the machine state that triggers it — no manual
  // "did I already fire this?" tracking inside a render accessor.
  // Cleanup runs on unmount to drop the timer if the user navigates
  // away mid-submit.
  let submitTimer: ReturnType<typeof setTimeout> | undefined
  onMount(() => {
    const unsubscribe = wizardMachine.onEnter('submitting', () => {
      submitTimer = setTimeout(() => wizardMachine.send('DONE'), 600)
    })
    onUnmount(() => {
      unsubscribe()
      if (submitTimer !== undefined) clearTimeout(submitTimer)
    })
  })

  return (
    <WizardPage>
      <WizardTitle>Onboarding wizard</WizardTitle>
      <WizardLead>
        Multi-step form with per-step Zod validation, a state-tree model that holds the
        collected data across steps, and a state machine driving navigation.
      </WizardLead>

      <Stepper>
        {STEPS.map((step) => (
          <StepperItem $state={resolveStepState(step)}>
            <StepBubble $state={resolveStepState(step)}>
              {() => (resolveStepState(step) === 'done' ? '✓' : stepIndex(step) + 1)}
            </StepBubble>
            <StepLabel $state={resolveStepState(step)}>{STEP_LABELS[step]}</StepLabel>
          </StepperItem>
        ))}
      </Stepper>

      {() => {
        if (wizardMachine.matches('account')) return <AccountStep />
        if (wizardMachine.matches('profile')) return <ProfileStep />
        if (wizardMachine.matches('preferences')) return <PreferencesStep />
        if (wizardMachine.matches('review') || wizardMachine.matches('submitting')) {
          return <ReviewStep />
        }
        if (wizardMachine.matches('success')) return <SuccessPanel />
        return null
      }}

      <PatchLog>
        <span>State-tree patches captured</span>
        <strong>{() => `${patchCount()} edit${patchCount() === 1 ? '' : 's'}`}</strong>
      </PatchLog>
    </WizardPage>
  )
}

/**
 * Map a step to its visual state by comparing it to the current
 * machine position. The `submitting` state is treated as `review` for
 * stepper purposes — the user is still on the review screen, just
 * with a loading button.
 */
function resolveStepState(step: Step): 'done' | 'current' | 'upcoming' {
  const current = wizardMachine()
  const currentIndex = stepIndex(current === 'submitting' ? 'review' : current)
  const myIndex = stepIndex(step)
  if (myIndex < currentIndex) return 'done'
  if (myIndex === currentIndex) return 'current'
  return 'upcoming'
}

/** Terminal success panel — offers a reset back to step 1. */
function SuccessPanel() {
  const wizard = useWizard()

  function startOver() {
    wizard.reset()
    wizardMachine.send('RESET')
  }

  // Show a redacted summary of what was "submitted" so the user
  // knows their data was captured.
  const snapshot = snapshotWizard(wizard)

  return (
    <SuccessCard>
      <SuccessIcon>✓</SuccessIcon>
      <SuccessTitle>You're all set, {snapshot.profile.fullName || 'friend'}!</SuccessTitle>
      <SuccessText>
        Your account at {snapshot.account.email} is ready. We've configured your dashboard for
        a {snapshot.profile.companySize.replace('-', ' ')} team.
      </SuccessText>
      <NavNext type="button" onClick={startOver}>
        Start over
      </NavNext>
    </SuccessCard>
  )
}

export const meta = {
  title: 'Forms Wizard — Pyreon App Showcase',
}

