import { COMPANY_SIZE_LABELS, THEME_LABELS } from './schema'
import {
  NavBack,
  NavBar,
  NavNext,
  ReviewLabel,
  ReviewRow,
  ReviewSection,
  ReviewSectionTitle,
  StepCard,
  StepHeading,
  StepHint,
} from './styled'
import { wizardMachine } from './wizardMachine'
import { snapshotWizard, useWizard } from './wizardModel'

/**
 * Final step — read the merged snapshot off the state-tree model
 * and render it as a review summary. The "Submit" button kicks the
 * machine into `submitting`, where the wizard route fakes a network
 * call and then transitions to `success`.
 */
export function ReviewStep() {
  const wizard = useWizard()

  return () => {
    // Read the snapshot inside the reactive accessor so the review
    // updates if the user navigates back, edits, then returns.
    const snapshot = snapshotWizard(wizard)

    return (
      <StepCard>
        <StepHeading>Review your details</StepHeading>
        <StepHint>Make sure everything looks right before we set up your account.</StepHint>

        <ReviewSection>
          <ReviewSectionTitle>Account</ReviewSectionTitle>
          <ReviewRow>
            <ReviewLabel>Email</ReviewLabel>
            <span>{snapshot.account.email}</span>
          </ReviewRow>
          <ReviewRow>
            <ReviewLabel>Password</ReviewLabel>
            <span>•••••••• ({snapshot.account.password.length} chars)</span>
          </ReviewRow>
        </ReviewSection>

        <ReviewSection>
          <ReviewSectionTitle>Profile</ReviewSectionTitle>
          <ReviewRow>
            <ReviewLabel>Name</ReviewLabel>
            <span>{snapshot.profile.fullName}</span>
          </ReviewRow>
          <ReviewRow>
            <ReviewLabel>Job title</ReviewLabel>
            <span>{snapshot.profile.jobTitle}</span>
          </ReviewRow>
          <ReviewRow>
            <ReviewLabel>Company size</ReviewLabel>
            <span>{COMPANY_SIZE_LABELS[snapshot.profile.companySize]}</span>
          </ReviewRow>
        </ReviewSection>

        <ReviewSection>
          <ReviewSectionTitle>Preferences</ReviewSectionTitle>
          <ReviewRow>
            <ReviewLabel>Theme</ReviewLabel>
            <span>{THEME_LABELS[snapshot.preferences.theme]}</span>
          </ReviewRow>
          <ReviewRow>
            <ReviewLabel>Email alerts</ReviewLabel>
            <span>{snapshot.preferences.notificationsEmail ? 'On' : 'Off'}</span>
          </ReviewRow>
          <ReviewRow>
            <ReviewLabel>Push alerts</ReviewLabel>
            <span>{snapshot.preferences.notificationsPush ? 'On' : 'Off'}</span>
          </ReviewRow>
          <ReviewRow>
            <ReviewLabel>Weekly digest</ReviewLabel>
            <span>{snapshot.preferences.weeklyDigest ? 'On' : 'Off'}</span>
          </ReviewRow>
        </ReviewSection>

        <NavBar>
          <NavBack type="button" onClick={() => wizardMachine.send('PREV')}>
            ← Back
          </NavBack>
          <NavNext
            type="button"
            disabled={wizardMachine.matches('submitting')}
            onClick={() => wizardMachine.send('SUBMIT')}
          >
            {wizardMachine.matches('submitting') ? 'Creating account…' : 'Create account ✓'}
          </NavNext>
        </NavBar>
      </StepCard>
    )
  }
}
