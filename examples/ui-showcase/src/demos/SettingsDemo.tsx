import { signal } from '@pyreon/reactivity'
import {
  Card,
  Title,
  Paragraph,
  Button,
  Input,
  Textarea,
  Switch,
  Radio,
  RadioGroup,
  Select,
  Divider,
  FormField,
  FieldLabel,
  FieldDescription,
  Avatar,
} from '@pyreon/ui-components'

export function SettingsDemo() {
  const name = signal('Vit Bokisch')
  const email = signal('vit@pyreon.dev')
  const bio = signal('Full-stack developer passionate about signal-based reactivity and high-performance UI frameworks.')
  const emailNotifications = signal(true)
  const pushNotifications = signal(false)
  const darkMode = signal(false)
  const language = signal('en')
  const timezone = signal('Europe/Prague')
  const saved = signal(false)

  const handleSave = () => {
    saved.set(true)
    setTimeout(() => saved.set(false), 2000)
  }

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Settings Page</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        A settings page combining Card, FormField, Input, Textarea, Switch, RadioGroup, Select, and Divider.
      </p>

      <div style="max-width: 640px;">
        {/* Profile Settings */}
        <Card {...{ variant: 'elevated' } as any}>
          <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
            <Avatar {...{ size: 'xl' } as any}>VB</Avatar>
            <div>
              <Title {...{ size: 'h4' } as any}>Profile Settings</Title>
              <Paragraph {...{ size: 'sm', style: 'color: #6b7280; margin-top: 2px;' } as any}>
                Manage your account information and preferences.
              </Paragraph>
            </div>
          </div>

          {/* Name */}
          <div style="margin-bottom: 20px;">
            <FormField>
              <FieldLabel>Full Name</FieldLabel>
              <Input
                value={name()}
                onInput={(e: Event) => name.set((e.target as HTMLInputElement).value)}
                placeholder="Your full name"
              />
            </FormField>
          </div>

          {/* Email */}
          <div style="margin-bottom: 20px;">
            <FormField>
              <FieldLabel>Email Address</FieldLabel>
              <Input
                type="email"
                value={email()}
                onInput={(e: Event) => email.set((e.target as HTMLInputElement).value)}
                placeholder="you@example.com"
              />
              <FieldDescription>This email is used for login and notifications.</FieldDescription>
            </FormField>
          </div>

          {/* Bio */}
          <div style="margin-bottom: 24px;">
            <FormField>
              <FieldLabel>Bio</FieldLabel>
              <Textarea
                value={bio()}
                onInput={(e: Event) => bio.set((e.target as HTMLTextAreaElement).value)}
                placeholder="Tell us about yourself"
                rows={4}
              />
              <FieldDescription>
                {() => `${bio().length}/200 characters`}
              </FieldDescription>
            </FormField>
          </div>

          <Divider />

          {/* Notification Preferences */}
          <div style="margin-top: 24px; margin-bottom: 24px;">
            <Title {...{ size: 'h5', style: 'margin-bottom: 16px;' } as any}>Notifications</Title>

            <div style="display: flex; flex-direction: column; gap: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <Paragraph {...{ size: 'sm', style: 'font-weight: 500;' } as any}>Email Notifications</Paragraph>
                  <Paragraph {...{ size: 'sm', style: 'color: #6b7280;' } as any}>Receive updates about your account via email.</Paragraph>
                </div>
                <Switch
                  checked={emailNotifications()}
                  onChange={() => emailNotifications.update((v) => !v)}
                />
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <Paragraph {...{ size: 'sm', style: 'font-weight: 500;' } as any}>Push Notifications</Paragraph>
                  <Paragraph {...{ size: 'sm', style: 'color: #6b7280;' } as any}>Get instant notifications in your browser.</Paragraph>
                </div>
                <Switch
                  checked={pushNotifications()}
                  onChange={() => pushNotifications.update((v) => !v)}
                />
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <Paragraph {...{ size: 'sm', style: 'font-weight: 500;' } as any}>Dark Mode</Paragraph>
                  <Paragraph {...{ size: 'sm', style: 'color: #6b7280;' } as any}>Switch between light and dark appearance.</Paragraph>
                </div>
                <Switch
                  checked={darkMode()}
                  onChange={() => darkMode.update((v) => !v)}
                />
              </div>
            </div>
          </div>

          <Divider />

          {/* Language */}
          <div style="margin-top: 24px; margin-bottom: 24px;">
            <Title {...{ size: 'h5', style: 'margin-bottom: 16px;' } as any}>Language & Region</Title>

            <div style="margin-bottom: 20px;">
              <FormField>
                <FieldLabel>Language</FieldLabel>
                <RadioGroup
                  value={language()}
                  onChange={(v: string) => language.set(v)}
                >
                  <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <Radio value="en" />
                      <span style="font-size: 14px;">English</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <Radio value="cs" />
                      <span style="font-size: 14px;">Czech (Cestina)</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <Radio value="de" />
                      <span style="font-size: 14px;">German (Deutsch)</span>
                    </div>
                  </div>
                </RadioGroup>
              </FormField>
            </div>

            <div style="margin-bottom: 20px;">
              <FormField>
                <FieldLabel>Timezone</FieldLabel>
                <Select
                  value={timezone()}
                  onChange={(v: string) => timezone.set(v)}
                >
                  <option value="America/New_York">Eastern Time (UTC-5)</option>
                  <option value="America/Chicago">Central Time (UTC-6)</option>
                  <option value="America/Los_Angeles">Pacific Time (UTC-8)</option>
                  <option value="Europe/London">London (UTC+0)</option>
                  <option value="Europe/Berlin">Berlin (UTC+1)</option>
                  <option value="Europe/Prague">Prague (UTC+1)</option>
                  <option value="Asia/Tokyo">Tokyo (UTC+9)</option>
                </Select>
              </FormField>
            </div>
          </div>

          <Divider />

          {/* Action Buttons */}
          <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
            <Button {...{ state: 'secondary', variant: 'ghost', size: 'md' } as any}>Cancel</Button>
            <Button {...{ state: 'primary', size: 'md' } as any} onClick={handleSave}>
              {() => saved() ? 'Saved!' : 'Save Changes'}
            </Button>
          </div>
        </Card>

        {/* Danger Zone */}
        <div style="margin-top: 24px;">
          <Card {...{ variant: 'outline' } as any}>
            <Title {...{ size: 'h5', style: 'color: #ef4444; margin-bottom: 8px;' } as any}>Danger Zone</Title>
            <Paragraph {...{ size: 'sm', style: 'color: #6b7280; margin-bottom: 16px;' } as any}>
              Irreversible actions. Please proceed with caution.
            </Paragraph>
            <div style="display: flex; gap: 12px;">
              <Button {...{ state: 'danger', variant: 'outline', size: 'sm' } as any}>Delete Account</Button>
              <Button {...{ state: 'danger', variant: 'ghost', size: 'sm' } as any}>Export Data</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
