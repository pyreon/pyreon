import { signal } from '@pyreon/reactivity'
import { RadioGroup, Radio, Title } from '@pyreon/ui-components'

export function RadioDemo() {
  const plan = signal('pro')

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Radio</Title>

      <RadioGroup
        value={plan()}
        onChange={(v: string) => plan.set(v)}
        variant="vertical"
        style="margin-bottom: 24px;"
      >
        {['free', 'pro', 'enterprise'].map((value) => (
          <Radio value={value}>
            {value.charAt(0).toUpperCase() + value.slice(1)}
          </Radio>
        ))}
      </RadioGroup>

      <p style="font-size: 13px; color: #6b7280;">
        Selected: {plan()}
      </p>
    </div>
  )
}
