import { state } from '@pyreon/core/plain'
import { RadioGroup, Radio, Title } from '@pyreon/ui-components'

export function RadioDemo() {
  let plan = state('pro')

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Radio</Title>

      <RadioGroup
        value={plan}
        onChange={(v: string) => { plan = v }}
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
        Selected: {plan}
      </p>
    </div>
  )
}
