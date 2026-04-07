import { signal } from '@pyreon/reactivity'
import { FormField, FieldLabel, FieldError, FieldDescription, Input } from '@pyreon/ui-components'

export function FormFieldDemo() {
  const name = signal('')
  const email = signal('not-an-email')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">FormField</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Composable form field with label, description, and error message slots.
      </p>

      {/* Basic composition */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic Composition</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px; max-width: 400px;">
        <FormField>
          <FieldLabel>Full Name</FieldLabel>
          <Input
            placeholder="Enter your name"
            value={name()}
            onInput={(e: Event) => name.set((e.target as HTMLInputElement).value)}
          />
          <FieldDescription>Your display name on the platform.</FieldDescription>
        </FormField>
      </div>

      {/* With error */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Error Message</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px; max-width: 400px;">
        <FormField>
          <FieldLabel>Email Address</FieldLabel>
          <Input
            {...{ state: 'error' } as any}
            value={email()}
            onInput={(e: Event) => email.set((e.target as HTMLInputElement).value)}
          />
          <FieldError>Please enter a valid email address.</FieldError>
        </FormField>
      </div>

      {/* With success */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Success State</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px; max-width: 400px;">
        <FormField>
          <FieldLabel>Website</FieldLabel>
          <Input {...{ state: 'success' } as any} value="https://pyreon.dev" />
          <FieldDescription>Looks good!</FieldDescription>
        </FormField>
      </div>

      {/* Multiple fields */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Multiple Fields</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px; max-width: 400px;">
        <FormField>
          <FieldLabel>First Name</FieldLabel>
          <Input placeholder="Jane" />
        </FormField>
        <FormField>
          <FieldLabel>Last Name</FieldLabel>
          <Input placeholder="Doe" />
        </FormField>
        <FormField>
          <FieldLabel>Bio</FieldLabel>
          <Input placeholder="Tell us about yourself" />
          <FieldDescription>Max 200 characters.</FieldDescription>
        </FormField>
      </div>

      {/* Label only, description only */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Minimal Compositions</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px; max-width: 400px;">
        <FormField>
          <FieldLabel>Label Only</FieldLabel>
          <Input placeholder="No description or error" />
        </FormField>
        <FormField>
          <Input placeholder="No label at all" />
          <FieldDescription>Just a description below the input.</FieldDescription>
        </FormField>
      </div>
    </div>
  )
}
