import { signal } from '@pyreon/reactivity'
import { RadioGroup, Radio, Title } from '@pyreon/ui-components'

function RadioIndicator(props: { checked: boolean }) {
  return (
    <span style={() => `width: 18px; height: 18px; border: 2px solid ${props.checked ? '#3b82f6' : '#d1d5db'}; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; transition: all 0.15s; flex-shrink: 0;`}>
      {() => props.checked ? (
        <span style="width: 8px; height: 8px; border-radius: 50%; background: #3b82f6;" />
      ) : null}
    </span>
  )
}

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
            <RadioIndicator checked={plan() === value} />
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
