import { signal } from '@pyreon/reactivity'
import { Checkbox, Title } from '@pyreon/ui-components'

function CheckboxIndicator(props: { checked: boolean }) {
  return (
    <span style={() => `width: 18px; height: 18px; border: 2px solid ${props.checked ? '#3b82f6' : '#d1d5db'}; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; background: ${props.checked ? '#3b82f6' : 'white'}; color: white; font-size: 12px; transition: all 0.15s; flex-shrink: 0;`}>
      {() => props.checked ? '✓' : ''}
    </span>
  )
}

export function CheckboxDemo() {
  const agreed = signal(false)
  const newsletter = signal(true)

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Checkbox</Title>

      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Checkbox checked={agreed()} onChange={(v: boolean) => agreed.set(v)}>
          <CheckboxIndicator checked={agreed()} />
          I agree to the terms
        </Checkbox>
        <Checkbox checked={newsletter()} onChange={(v: boolean) => newsletter.set(v)}>
          <CheckboxIndicator checked={newsletter()} />
          Subscribe to newsletter
        </Checkbox>
        <Checkbox checked={false} onChange={() => {}} disabled>
          <CheckboxIndicator checked={false} />
          Disabled option
        </Checkbox>
      </div>

      <p style="font-size: 13px; color: #6b7280;">
        Agreed: {agreed()} | Newsletter: {newsletter()}
      </p>
    </div>
  )
}
