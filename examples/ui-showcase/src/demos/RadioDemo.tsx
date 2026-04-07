import { signal } from '@pyreon/reactivity'
import { RadioGroupBase, RadioBase } from '@pyreon/ui-primitives'

export function RadioDemo() {
  const plan = signal('pro')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Radio</h2>

      <RadioGroupBase
        value={plan()}
        onChange={(v: string) => plan.set(v)}
        style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;"
      >
        {['free', 'pro', 'enterprise'].map((value) => (
          <RadioBase
            value={value}
            style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px;"
          >
            <span style={() => `width: 18px; height: 18px; border: 2px solid ${plan() === value ? '#3b82f6' : '#d1d5db'}; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; transition: all 0.15s;`}>
              {() => plan() === value ? (
                <span style="width: 8px; height: 8px; background: #3b82f6; border-radius: 50%;" />
              ) : null}
            </span>
            {value.charAt(0).toUpperCase() + value.slice(1)}
          </RadioBase>
        ))}
      </RadioGroupBase>

      <p style="font-size: 13px; color: #6b7280;">
        Selected: {() => plan()}
      </p>
    </div>
  )
}
