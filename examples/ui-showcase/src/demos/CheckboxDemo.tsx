import { signal } from '@pyreon/reactivity'
import { CheckboxBase } from '@pyreon/ui-primitives'

function CheckboxItem(props: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <CheckboxBase
      checked={props.checked}
      onChange={props.onChange}
      disabled={props.disabled}
      style={`display: inline-flex; align-items: center; gap: 8px; cursor: ${props.disabled ? 'not-allowed' : 'pointer'}; font-size: 14px; opacity: ${props.disabled ? '0.5' : '1'};`}
    >
      <span style={() => `width: 18px; height: 18px; border: 2px solid ${props.checked ? '#3b82f6' : '#d1d5db'}; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; background: ${props.checked ? '#3b82f6' : 'white'}; color: white; font-size: 12px; transition: all 0.15s; flex-shrink: 0;`}>
        {() => props.checked ? '✓' : ''}
      </span>
      {props.label}
    </CheckboxBase>
  )
}

export function CheckboxDemo() {
  const agreed = signal(false)
  const newsletter = signal(true)

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Checkbox</h2>

      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <CheckboxItem
          checked={agreed()}
          onChange={(v: boolean) => agreed.set(v)}
          label="I agree to the terms"
        />
        <CheckboxItem
          checked={newsletter()}
          onChange={(v: boolean) => newsletter.set(v)}
          label="Subscribe to newsletter"
        />
        <CheckboxItem
          checked={false}
          onChange={() => {}}
          disabled
          label="Disabled option"
        />
      </div>

      <p style="font-size: 13px; color: #6b7280;">
        Agreed: {() => String(agreed())} | Newsletter: {() => String(newsletter())}
      </p>
    </div>
  )
}
