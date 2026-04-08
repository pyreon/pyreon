import { useForm } from '@pyreon/form'
import { zodSchema } from '@pyreon/validation'
import { type PreferencesValues, preferencesSchema, THEME_LABELS } from './schema'
import {
  Checkbox,
  FieldError,
  FieldGroup,
  FieldLabel,
  NavBack,
  NavBar,
  NavNext,
  SelectInput,
  StepCard,
  StepHeading,
  StepHint,
  ToggleHint,
  ToggleRow,
  ToggleText,
  ToggleTitle,
} from './styled'
import { wizardMachine } from './wizardMachine'
import { useWizard } from './wizardModel'

const THEME_OPTIONS: PreferencesValues['theme'][] = ['light', 'dark', 'system']

/**
 * Third step — UI preferences and notification toggles.
 *
 * Demonstrates `useForm` with mixed input types (select + checkboxes).
 * The schema is intentionally simple — every field has a default
 * (`'system'`, `true`/`false`) so the form can never be invalid.
 */
export function PreferencesStep() {
  const wizard = useWizard()

  const form = useForm<PreferencesValues>({
    initialValues: wizard.preferences.peek(),
    schema: zodSchema(preferencesSchema as never),
    validateOn: 'blur',
    onSubmit: (values) => {
      wizard.setPreferences(values)
      wizardMachine.send('NEXT')
    },
  })

  const fields = form.fields

  return (
    <StepCard>
      <StepHeading>Pick your preferences</StepHeading>
      <StepHint>You can change these later from the dashboard settings page.</StepHint>

      <form onSubmit={(e: Event) => form.handleSubmit(e)}>
        <FieldGroup>
          <FieldLabel for="theme">Theme</FieldLabel>
          <SelectInput
            id="theme"
            value={fields.theme.value()}
            onInput={(e: Event) =>
              fields.theme.setValue(
                (e.target as HTMLSelectElement).value as PreferencesValues['theme'],
              )
            }
          >
            {THEME_OPTIONS.map((option) => (
              <option value={option}>{THEME_LABELS[option]}</option>
            ))}
          </SelectInput>
          <FieldError>
            {() => (fields.theme.touched() ? (fields.theme.error() ?? '') : '')}
          </FieldError>
        </FieldGroup>

        <ToggleRow>
          <ToggleText>
            <ToggleTitle>Email notifications</ToggleTitle>
            <ToggleHint>Get notified about important account updates.</ToggleHint>
          </ToggleText>
          <Checkbox
            type="checkbox"
            checked={fields.notificationsEmail.value()}
            onChange={(e: Event) =>
              fields.notificationsEmail.setValue((e.target as HTMLInputElement).checked)
            }
          />
        </ToggleRow>

        <ToggleRow>
          <ToggleText>
            <ToggleTitle>Push notifications</ToggleTitle>
            <ToggleHint>Browser push for live activity. Off by default.</ToggleHint>
          </ToggleText>
          <Checkbox
            type="checkbox"
            checked={fields.notificationsPush.value()}
            onChange={(e: Event) =>
              fields.notificationsPush.setValue((e.target as HTMLInputElement).checked)
            }
          />
        </ToggleRow>

        <ToggleRow>
          <ToggleText>
            <ToggleTitle>Weekly digest</ToggleTitle>
            <ToggleHint>A summary email every Monday morning.</ToggleHint>
          </ToggleText>
          <Checkbox
            type="checkbox"
            checked={fields.weeklyDigest.value()}
            onChange={(e: Event) =>
              fields.weeklyDigest.setValue((e.target as HTMLInputElement).checked)
            }
          />
        </ToggleRow>

        <NavBar>
          <NavBack type="button" onClick={() => wizardMachine.send('PREV')}>
            ← Back
          </NavBack>
          <NavNext type="submit" disabled={form.isSubmitting()}>
            Review →
          </NavNext>
        </NavBar>
      </form>
    </StepCard>
  )
}
