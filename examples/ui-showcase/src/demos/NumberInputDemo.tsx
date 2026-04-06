import { signal } from '@pyreon/reactivity'
import { NumberInput, FieldLabel } from '@pyreon/ui-components'

export function NumberInputDemo() {
  const quantity = signal(1)

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">NumberInput</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Numeric input field with sizes and controlled value.
      </p>

      {/* Basic */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic</h3>
      <div style="max-width: 200px; margin-bottom: 32px;">
        <FieldLabel>Quantity</FieldLabel>
        <NumberInput
          type="number"
          value={quantity()}
          onInput={(e: Event) => quantity.set(Number((e.target as HTMLInputElement).value))}
          min={0}
          max={99}
        />
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">
          Value: {() => quantity()}
        </p>
      </div>

      {/* Sizes */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; max-width: 200px;">
        <div>
          <FieldLabel>Small</FieldLabel>
          <NumberInput type="number" size="sm" placeholder="0" />
        </div>
        <div>
          <FieldLabel>Medium (default)</FieldLabel>
          <NumberInput type="number" size="md" placeholder="0" />
        </div>
        <div>
          <FieldLabel>Large</FieldLabel>
          <NumberInput type="number" size="lg" placeholder="0" />
        </div>
      </div>

      {/* With min/max/step */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Min/Max/Step</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; max-width: 200px;">
        <div>
          <FieldLabel>Price (step 0.01)</FieldLabel>
          <NumberInput type="number" min={0} max={1000} step={0.01} placeholder="0.00" />
        </div>
        <div>
          <FieldLabel>Rating (1-5)</FieldLabel>
          <NumberInput type="number" min={1} max={5} step={1} placeholder="1" />
        </div>
        <div>
          <FieldLabel>Percentage (step 10)</FieldLabel>
          <NumberInput type="number" min={0} max={100} step={10} placeholder="0" />
        </div>
      </div>

      {/* Disabled */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Disabled</h3>
      <div style="max-width: 200px; margin-bottom: 32px;">
        <NumberInput type="number" disabled value={42} />
      </div>

      {/* Side by side */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Inline Layout</h3>
      <div style="display: flex; gap: 12px; align-items: flex-end; margin-bottom: 32px;">
        <div style="width: 100px;">
          <FieldLabel>Min</FieldLabel>
          <NumberInput type="number" placeholder="0" />
        </div>
        <div style="width: 100px;">
          <FieldLabel>Max</FieldLabel>
          <NumberInput type="number" placeholder="100" />
        </div>
        <div style="width: 100px;">
          <FieldLabel>Step</FieldLabel>
          <NumberInput type="number" placeholder="1" />
        </div>
      </div>
    </div>
  )
}
