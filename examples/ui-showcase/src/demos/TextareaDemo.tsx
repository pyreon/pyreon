import { signal } from '@pyreon/reactivity'
import { Textarea, FieldLabel } from '@pyreon/ui-components'

export function TextareaDemo() {
  const bio = signal('')
  const autoText = signal('')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Textarea</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Multi-line text input with sizes, states, and auto-resize support.
      </p>

      {/* Basic */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic</h3>
      <div style="max-width: 400px; margin-bottom: 32px;">
        <Textarea
          placeholder="Write something..."
          value={bio()}
          onInput={(e: Event) => bio.set((e.target as HTMLTextAreaElement).value)}
        />
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">
          Characters: {() => bio().length}
        </p>
      </div>

      {/* Sizes */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; max-width: 400px;">
        <div>
          <FieldLabel>Small</FieldLabel>
          <Textarea size="sm" placeholder="Small textarea" />
        </div>
        <div>
          <FieldLabel>Medium (default)</FieldLabel>
          <Textarea size="md" placeholder="Medium textarea" />
        </div>
        <div>
          <FieldLabel>Large</FieldLabel>
          <Textarea size="lg" placeholder="Large textarea" />
        </div>
      </div>

      {/* States */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">States</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; max-width: 400px;">
        <div>
          <FieldLabel>Error State</FieldLabel>
          <Textarea {...{ state: 'error' } as any} value="Too short" />
        </div>
        <div>
          <FieldLabel>Success State</FieldLabel>
          <Textarea {...{ state: 'success' } as any} value="This description meets the requirements." />
        </div>
      </div>

      {/* Disabled */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Disabled</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; max-width: 400px;">
        <Textarea disabled placeholder="Disabled empty" />
        <Textarea disabled value="Disabled with existing content that cannot be edited." />
      </div>

      {/* Auto-resize simulation */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Auto-Resize (via rows)</h3>
      <div style="max-width: 400px; margin-bottom: 32px;">
        <Textarea
          placeholder="Type multiple lines to see it grow..."
          value={autoText()}
          onInput={(e: Event) => autoText.set((e.target as HTMLTextAreaElement).value)}
          rows={Math.max(3, autoText().split('\n').length + 1)}
        />
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">
          Lines: {() => Math.max(1, autoText().split('\n').length)}
        </p>
      </div>

      {/* With max length */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Character Limit</h3>
      <div style="max-width: 400px; margin-bottom: 32px;">
        <FieldLabel>Description (max 200 chars)</FieldLabel>
        <Textarea placeholder="Enter a description..." maxLength={200} />
      </div>
    </div>
  )
}
