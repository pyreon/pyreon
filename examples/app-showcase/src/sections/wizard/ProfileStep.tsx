import { useForm } from '@pyreon/form'
import { zodSchema } from '@pyreon/validation'
import {
  COMPANY_SIZE_LABELS,
  type ProfileValues,
  profileSchema,
} from './schema'
import {
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
  TextInput,
} from './styled'
import { wizardMachine } from './wizardMachine'
import { useWizard } from './wizardModel'

const COMPANY_SIZE_OPTIONS: ProfileValues['companySize'][] = [
  'just-me',
  'small',
  'medium',
  'large',
  'enterprise',
]

/**
 * Second step — name + role + company size.
 *
 * Same useForm + zodSchema pattern as AccountStep. The state-tree
 * `wizard.profile.peek()` gives us whatever the user typed previously
 * if they navigate back and forth, so the form persists across steps.
 */
export function ProfileStep() {
  const wizard = useWizard()

  const form = useForm<ProfileValues>({
    initialValues: wizard.profile.peek(),
    schema: zodSchema(profileSchema as never),
    validateOn: 'blur',
    onSubmit: (values) => {
      wizard.setProfile(values)
      wizardMachine.send('NEXT')
    },
  })

  const fields = form.fields

  return (
    <StepCard>
      <StepHeading>Tell us about yourself</StepHeading>
      <StepHint>
        We'll use this to personalize your dashboard and tailor onboarding suggestions.
      </StepHint>

      <form onSubmit={(e: Event) => form.handleSubmit(e)}>
        <FieldGroup>
          <FieldLabel for="fullName">Full name</FieldLabel>
          <TextInput
            id="fullName"
            type="text"
            placeholder="Aisha Aldridge"
            value={fields.fullName.value()}
            $invalid={fields.fullName.touched() && fields.fullName.error() !== undefined}
            onInput={(e: Event) =>
              fields.fullName.setValue((e.target as HTMLInputElement).value)
            }
            onBlur={() => fields.fullName.setTouched()}
          />
          <FieldError>
            {() => (fields.fullName.touched() ? (fields.fullName.error() ?? '') : '')}
          </FieldError>
        </FieldGroup>

        <FieldGroup>
          <FieldLabel for="jobTitle">Job title</FieldLabel>
          <TextInput
            id="jobTitle"
            type="text"
            placeholder="Senior engineer"
            value={fields.jobTitle.value()}
            $invalid={fields.jobTitle.touched() && fields.jobTitle.error() !== undefined}
            onInput={(e: Event) =>
              fields.jobTitle.setValue((e.target as HTMLInputElement).value)
            }
            onBlur={() => fields.jobTitle.setTouched()}
          />
          <FieldError>
            {() => (fields.jobTitle.touched() ? (fields.jobTitle.error() ?? '') : '')}
          </FieldError>
        </FieldGroup>

        <FieldGroup>
          <FieldLabel for="companySize">Company size</FieldLabel>
          <SelectInput
            id="companySize"
            value={fields.companySize.value()}
            onInput={(e: Event) =>
              fields.companySize.setValue(
                (e.target as HTMLSelectElement).value as ProfileValues['companySize'],
              )
            }
            onBlur={() => fields.companySize.setTouched()}
          >
            {COMPANY_SIZE_OPTIONS.map((option) => (
              <option value={option}>{COMPANY_SIZE_LABELS[option]}</option>
            ))}
          </SelectInput>
          <FieldError>
            {() => (fields.companySize.touched() ? (fields.companySize.error() ?? '') : '')}
          </FieldError>
        </FieldGroup>

        <NavBar>
          <NavBack type="button" onClick={() => wizardMachine.send('PREV')}>
            ← Back
          </NavBack>
          <NavNext type="submit" disabled={form.isSubmitting()}>
            Continue →
          </NavNext>
        </NavBar>
      </form>
    </StepCard>
  )
}
