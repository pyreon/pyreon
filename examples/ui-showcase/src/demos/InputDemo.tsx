import { signal } from '@pyreon/reactivity'
import { Input, Textarea, Title } from '@pyreon/ui-components'

export function InputDemo() {
  const name = signal('')

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Input</Title>

      <Title size="h3" style="margin-bottom: 12px">Basic</Title>
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

      <Title size="h3" style="margin-bottom: 12px">States</Title>
      <div style="max-width: 400px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Input state="error" placeholder="Error state" />
        <Input state="success" placeholder="Success state" />
      </div>

      <Title size="h3" style="margin-bottom: 12px">Sizes</Title>
      <div style="max-width: 400px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Input size="small" placeholder="Small" />
        <Input size="medium" placeholder="Medium" />
        <Input size="large" placeholder="Large" />
      </div>

      <Title size="h3" style="margin-bottom: 12px">Variants</Title>
      <div style="max-width: 400px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Input variant="outline" placeholder="Outline" />
        <Input variant="filled" placeholder="Filled" />
        <Input variant="underline" placeholder="Underline" />
      </div>

      <Title size="h3" style="margin-bottom: 12px">Textarea</Title>
      <div style="max-width: 400px; margin-bottom: 24px;">
        <Textarea placeholder="Write something..." rows={4} />
      </div>
    </div>
  )
}
