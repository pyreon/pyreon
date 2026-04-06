import { signal } from '@pyreon/reactivity'
import {
  Title,
  Paragraph,
  FormField,
  FieldLabel,
  FieldError,
  FieldDescription,
  Input,
  Textarea,
  Checkbox,
  Radio,
  RadioGroup,
  Switch,
  Select,
  Slider,
  Divider,
} from '@pyreon/ui-components'

function SectionTitle(props: { children: any }) {
  return <Title size="h3" style="margin: 24px 0 12px;">{props.children}</Title>
}

export function FormsSection() {
  const name = signal('')
  const email = signal('')
  const bio = signal('')
  const agree = signal(false)
  const plan = signal('pro')
  const darkMode = signal(false)
  const volume = signal(50)

  return (
    <div style="max-width: 500px;">
      <Title size="h2">Forms</Title>

      <SectionTitle>Text Input</SectionTitle>
      <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px;">
        <FieldLabel>Full Name</FieldLabel>
        <Input
          placeholder="Enter your name"
          value={name()}
          onInput={(e: Event) => name.set((e.target as HTMLInputElement).value)}
        />
        <FieldDescription>Your display name on the platform.</FieldDescription>
      </div>

      <SectionTitle>Input States</SectionTitle>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
        <div>
          <FieldLabel>Email (error state)</FieldLabel>
          <Input state="error" placeholder="invalid@email" value="not-an-email" />
          <FieldError>Please enter a valid email address.</FieldError>
        </div>
        <div>
          <FieldLabel>Website (success state)</FieldLabel>
          <Input state="success" value="https://pyreon.dev" />
        </div>
      </div>

      <SectionTitle>Input Variants</SectionTitle>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
        <Input variant="outline" placeholder="Outline (default)" />
        <Input variant="filled" placeholder="Filled variant" />
        <Input variant="underline" placeholder="Underline variant" />
      </div>

      <SectionTitle>Input Sizes</SectionTitle>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
        <Input size="sm" placeholder="Small" />
        <Input size="md" placeholder="Medium (default)" />
        <Input size="lg" placeholder="Large" />
      </div>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Textarea</SectionTitle>
      <div style="margin-bottom: 16px;">
        <FieldLabel>Bio</FieldLabel>
        <Textarea
          placeholder="Tell us about yourself..."
          value={bio()}
          onInput={(e: Event) => bio.set((e.target as HTMLTextAreaElement).value)}
        />
      </div>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Select</SectionTitle>
      <div style="margin-bottom: 16px;">
        <FieldLabel>Country</FieldLabel>
        <Select placeholder="Choose a country">
          <option value="us">United States</option>
          <option value="uk">United Kingdom</option>
          <option value="cz">Czech Republic</option>
          <option value="de">Germany</option>
        </Select>
      </div>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Checkbox</SectionTitle>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
        <Checkbox
          checked={agree()}
          onChange={(v: boolean) => agree.set(v)}
        >
          I agree to the terms and conditions
        </Checkbox>
        <Checkbox defaultChecked>Subscribe to newsletter</Checkbox>
        <Checkbox disabled>Disabled option</Checkbox>
      </div>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Radio Group</SectionTitle>
      <RadioGroup
        value={plan()}
        onChange={(v: string) => plan.set(v)}
      >
        <Radio value="free">Free Plan</Radio>
        <Radio value="pro">Pro Plan</Radio>
        <Radio value="enterprise">Enterprise Plan</Radio>
      </RadioGroup>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Switch</SectionTitle>
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
        <Switch
          checked={darkMode()}
          onChange={(v: boolean) => darkMode.set(v)}
        />
        <span>Dark mode: {() => darkMode() ? 'On' : 'Off'}</span>
      </div>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Slider</SectionTitle>
      <div style="margin-bottom: 16px;">
        <FieldLabel>Volume: {() => volume()}</FieldLabel>
        <Slider
          value={volume()}
          onChange={(v: number) => volume.set(v)}
          min={0}
          max={100}
        />
      </div>
    </div>
  )
}
