import { signal } from '@pyreon/reactivity'
import { Input, FieldLabel } from '@pyreon/ui-components'

export function InputDemo() {
  const text = signal('')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Input</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Text input field with multiple sizes, variants, and states.
      </p>

      {/* Sizes */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px; max-width: 400px;">
        <Input size="sm" placeholder="Small (sm)" />
        <Input size="md" placeholder="Medium (md) — default" />
        <Input size="lg" placeholder="Large (lg)" />
      </div>

      {/* Variants */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Variants</h3>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px; max-width: 400px;">
        <Input variant="outline" placeholder="Outline (default)" />
        <Input variant="filled" placeholder="Filled variant" />
        <Input variant="underline" placeholder="Underline variant" />
      </div>

      {/* States */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">States</h3>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px; max-width: 400px;">
        <div>
          <FieldLabel>Default</FieldLabel>
          <Input placeholder="Default state" />
        </div>
        <div>
          <FieldLabel>Error</FieldLabel>
          <Input {...{ state: 'error' } as any} placeholder="Error state" value="invalid input" />
        </div>
        <div>
          <FieldLabel>Success</FieldLabel>
          <Input {...{ state: 'success' } as any} value="valid@email.com" />
        </div>
      </div>

      {/* Disabled */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Disabled</h3>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px; max-width: 400px;">
        <Input disabled placeholder="Disabled empty" />
        <Input disabled value="Disabled with value" />
      </div>

      {/* With labels */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Labels</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; max-width: 400px;">
        <div>
          <FieldLabel>Username</FieldLabel>
          <Input placeholder="johndoe" />
        </div>
        <div>
          <FieldLabel>Password</FieldLabel>
          <Input type="password" placeholder="Enter password" />
        </div>
      </div>

      {/* Controlled */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Controlled Input</h3>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px; max-width: 400px;">
        <Input
          value={text()}
          onInput={(e: Event) => text.set((e.target as HTMLInputElement).value)}
          placeholder="Type something..."
        />
        <p style="color: #6b7280; font-size: 14px;">
          Value: {() => text() || '(empty)'}
        </p>
      </div>

      {/* All sizes x variants */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Size + Variant Matrix</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px; max-width: 500px;">
        {(['outline', 'filled', 'underline'] as const).map((v) => (
          <div>
            <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">{v}</p>
            <div style="display: flex; gap: 8px; align-items: center;">
              <Input size="sm" variant={v} placeholder="sm" />
              <Input size="md" variant={v} placeholder="md" />
              <Input size="lg" variant={v} placeholder="lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
