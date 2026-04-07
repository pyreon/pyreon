import { signal } from '@pyreon/reactivity'
import { Input, Textarea } from '@pyreon/ui-components'

export function InputDemo() {
  const name = signal('')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Input</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Basic</h3>
      <div style="max-width: 400px; margin-bottom: 24px;">
        <Input
          placeholder="Enter your name"
          value={name()}
          onInput={(e: Event) => name.set((e.target as HTMLInputElement).value)}
        />
        <p style="font-size: 13px; color: #6b7280; margin-top: 8px;">
          Value: {() => name() || '(empty)'}
        </p>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">States</h3>
      <div style="max-width: 400px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Input state="error" placeholder="Error state" />
        <Input state="success" placeholder="Success state" />
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="max-width: 400px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Input size="small" placeholder="Small" />
        <Input size="medium" placeholder="Medium" />
        <Input size="large" placeholder="Large" />
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Variants</h3>
      <div style="max-width: 400px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Input variant="outline" placeholder="Outline" />
        <Input variant="filled" placeholder="Filled" />
        <Input variant="underline" placeholder="Underline" />
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Textarea</h3>
      <div style="max-width: 400px; margin-bottom: 24px;">
        <Textarea placeholder="Write something..." rows={4} />
      </div>
    </div>
  )
}
