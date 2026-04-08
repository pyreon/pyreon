import { useForm } from '@pyreon/form'
import { zodSchema } from '@pyreon/validation'
import {
  FieldError,
  FieldGroup,
  FieldLabel,
  NavBack,
  NavBar,
  NavNext,
  StepCard,
  StepHeading,
  StepHint,
  TextInput,
} from './styled'
import { type AccountValues, accountSchema } from './schema'
import { wizardMachine } from './wizardMachine'
import { useWizard } from './wizardModel'

/**
 * First step — email + password + confirm.
 *
 * Demonstrates the canonical `useForm` + `zodSchema` integration:
 * the schema validates on blur, and `handleSubmit` only fires
 * `onSubmit` when every field passes. We then write the validated
 * values into the wizard's state-tree model and tell the machine to
 * advance.
 */
export function AccountStep() {
  const wizard = useWizard()

  const form = useForm<AccountValues>({
    initialValues: wizard.account.peek(),
    schema: zodSchema(accountSchema as never),
    validateOn: 'blur',
    onSubmit: (values) => {
      wizard.setAccount(values)
      wizardMachine.send('NEXT')
    },
  })

  const fields = form.fields

  return (
    <StepCard>
      <StepHeading>Create your account</StepHeading>
      <StepHint>We'll use this email to send your weekly digest.</StepHint>

      <form onSubmit={(e: Event) => form.handleSubmit(e)}>
        <FieldGroup>
          <FieldLabel for="email">Email</FieldLabel>
          <TextInput
            id="email"
            type="email"
            placeholder="you@example.com"
            value={fields.email.value()}
            $invalid={fields.email.touched() && fields.email.error() !== undefined}
            onInput={(e: Event) => fields.email.setValue((e.target as HTMLInputElement).value)}
            onBlur={() => fields.email.setTouched()}
          />
          <FieldError>
            {() => (fields.email.touched() ? (fields.email.error() ?? '') : '')}
          </FieldError>
        </FieldGroup>

        <FieldGroup>
          <FieldLabel for="password">Password</FieldLabel>
          <TextInput
            id="password"
            type="password"
            placeholder="At least 8 characters"
            value={fields.password.value()}
            $invalid={fields.password.touched() && fields.password.error() !== undefined}
            onInput={(e: Event) =>
              fields.password.setValue((e.target as HTMLInputElement).value)
            }
            onBlur={() => fields.password.setTouched()}
          />
          <FieldError>
            {() => (fields.password.touched() ? (fields.password.error() ?? '') : '')}
          </FieldError>
        </FieldGroup>

        <FieldGroup>
          <FieldLabel for="confirmPassword">Confirm password</FieldLabel>
          <TextInput
            id="confirmPassword"
            type="password"
            placeholder="Type it again"
            value={fields.confirmPassword.value()}
            $invalid={
              fields.confirmPassword.touched() && fields.confirmPassword.error() !== undefined
            }
            onInput={(e: Event) =>
              fields.confirmPassword.setValue((e.target as HTMLInputElement).value)
            }
            onBlur={() => fields.confirmPassword.setTouched()}
          />
          <FieldError>
            {() =>
              fields.confirmPassword.touched() ? (fields.confirmPassword.error() ?? '') : ''
            }
          </FieldError>
        </FieldGroup>

        <NavBar>
          <NavBack type="button" disabled>
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
