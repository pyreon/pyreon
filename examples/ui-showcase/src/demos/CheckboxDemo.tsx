import { signal } from '@pyreon/reactivity'
import { Checkbox, Title } from '@pyreon/ui-components'

export function CheckboxDemo() {
  const agreed = signal(false)
  const newsletter = signal(true)

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Checkbox</Title>

      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Checkbox
          checked={agreed()}
          onChange={(v: boolean) => agreed.set(v)}
        >
          I agree to the terms
        </Checkbox>
        <Checkbox
          checked={newsletter()}
          onChange={(v: boolean) => newsletter.set(v)}
        >
          Subscribe to newsletter
        </Checkbox>
        <Checkbox
          checked={false}
          onChange={() => {}}
          disabled
        >
          Disabled option
        </Checkbox>
      </div>

      <p style="font-size: 13px; color: #6b7280;">
        Agreed: {agreed()} | Newsletter: {newsletter()}
      </p>
    </div>
  )
}
