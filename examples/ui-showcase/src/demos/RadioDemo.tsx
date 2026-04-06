import { signal } from '@pyreon/reactivity'
import { Radio, RadioGroup } from '@pyreon/ui-components'

export function RadioDemo() {
  const plan = signal('pro')
  const color = signal('blue')
  const size = signal('md')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Radio</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        RadioGroup with Radio options, controlled value, horizontal/vertical layout, and disabled state.
      </p>

      {/* Controlled vertical */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Controlled (Vertical)</h3>
      <div style="margin-bottom: 32px;">
        <RadioGroup
          value={plan()}
          onChange={(v: string) => plan.set(v)}
        >
          <Radio value="free">Free Plan</Radio>
          <Radio value="pro">Pro Plan</Radio>
          <Radio value="enterprise">Enterprise Plan</Radio>
        </RadioGroup>
        <p style="color: #6b7280; font-size: 14px; margin-top: 8px;">
          Selected: {() => plan()}
        </p>
      </div>

      {/* Horizontal */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Horizontal Layout</h3>
      <div style="margin-bottom: 32px;">
        <RadioGroup
          value={color()}
          onChange={(v: string) => color.set(v)}
          {...{ direction: 'row' } as any}
        >
          <Radio value="red">Red</Radio>
          <Radio value="blue">Blue</Radio>
          <Radio value="green">Green</Radio>
          <Radio value="purple">Purple</Radio>
        </RadioGroup>
        <p style="color: #6b7280; font-size: 14px; margin-top: 8px;">
          Color: {() => color()}
        </p>
      </div>

      {/* Sizes */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px;">
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Small</p>
          <RadioGroup
            value={size()}
            onChange={(v: string) => size.set(v)}
          >
            <Radio value="sm" size="sm">Small Radio</Radio>
          </RadioGroup>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Medium</p>
          <RadioGroup
            value={size()}
            onChange={(v: string) => size.set(v)}
          >
            <Radio value="md" size="md">Medium Radio</Radio>
          </RadioGroup>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Large</p>
          <RadioGroup
            value={size()}
            onChange={(v: string) => size.set(v)}
          >
            <Radio value="lg" size="lg">Large Radio</Radio>
          </RadioGroup>
        </div>
      </div>

      {/* Disabled */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Disabled</h3>
      <div style="margin-bottom: 32px;">
        <RadioGroup value="b" {...{ disabled: true } as any}>
          <Radio value="a">Disabled Option A</Radio>
          <Radio value="b">Disabled Option B (selected)</Radio>
          <Radio value="c">Disabled Option C</Radio>
        </RadioGroup>
      </div>

      {/* With descriptions */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Descriptions</h3>
      <div style="margin-bottom: 32px;">
        <RadioGroup
          value={plan()}
          onChange={(v: string) => plan.set(v)}
        >
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div>
              <Radio value="free">Free Plan</Radio>
              <p style="color: #6b7280; font-size: 13px; padding-left: 24px;">Basic features, 1 project</p>
            </div>
            <div>
              <Radio value="pro">Pro Plan</Radio>
              <p style="color: #6b7280; font-size: 13px; padding-left: 24px;">All features, unlimited projects</p>
            </div>
            <div>
              <Radio value="enterprise">Enterprise Plan</Radio>
              <p style="color: #6b7280; font-size: 13px; padding-left: 24px;">Custom SLAs, dedicated support</p>
            </div>
          </div>
        </RadioGroup>
      </div>
    </div>
  )
}
