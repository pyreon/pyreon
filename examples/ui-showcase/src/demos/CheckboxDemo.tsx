import { signal } from '@pyreon/reactivity'
import { Checkbox } from '@pyreon/ui-components'

export function CheckboxDemo() {
  const checked = signal(false)
  const toppings = signal<string[]>(['cheese'])

  const toggleTopping = (topping: string) => {
    const current = toppings()
    if (current.includes(topping)) {
      toppings.set(current.filter((t) => t !== topping))
    } else {
      toppings.set([...current, topping])
    }
  }

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Checkbox</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Checkbox with controlled toggle, sizes, disabled, indeterminate, and group examples.
      </p>

      {/* Controlled toggle */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Controlled Toggle</h3>
      <div style="margin-bottom: 32px;">
        <Checkbox
          checked={checked()}
          onChange={(v: boolean) => checked.set(v)}
        >
          I accept the terms
        </Checkbox>
        <p style="color: #6b7280; font-size: 14px; margin-top: 8px;">
          Checked: {() => String(checked())}
        </p>
      </div>

      {/* Sizes */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px;">
        <Checkbox size="sm" defaultChecked>Small checkbox</Checkbox>
        <Checkbox size="md" defaultChecked>Medium checkbox (default)</Checkbox>
        <Checkbox size="lg" defaultChecked>Large checkbox</Checkbox>
      </div>

      {/* Disabled */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Disabled</h3>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px;">
        <Checkbox disabled>Disabled unchecked</Checkbox>
        <Checkbox disabled defaultChecked>Disabled checked</Checkbox>
      </div>

      {/* Indeterminate */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Indeterminate</h3>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px;">
        <Checkbox {...{ indeterminate: true } as any}>Select all (indeterminate)</Checkbox>
        <div style="padding-left: 24px; display: flex; flex-direction: column; gap: 4px;">
          <Checkbox defaultChecked>Option 1</Checkbox>
          <Checkbox>Option 2</Checkbox>
          <Checkbox defaultChecked>Option 3</Checkbox>
        </div>
      </div>

      {/* Group example */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Checkbox Group</h3>
      <div style="margin-bottom: 32px;">
        <p style="font-weight: 500; margin-bottom: 8px;">Pizza Toppings</p>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          {(['cheese', 'pepperoni', 'mushrooms', 'onions', 'olives'] as const).map((topping) => (
            <Checkbox
              checked={toppings().includes(topping)}
              onChange={() => toggleTopping(topping)}
            >
              {topping.charAt(0).toUpperCase() + topping.slice(1)}
            </Checkbox>
          ))}
        </div>
        <p style="color: #6b7280; font-size: 14px; margin-top: 8px;">
          Selected: {() => toppings().join(', ') || '(none)'}
        </p>
      </div>

      {/* Default checked */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Uncontrolled (defaultChecked)</h3>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px;">
        <Checkbox>Unchecked by default</Checkbox>
        <Checkbox defaultChecked>Checked by default</Checkbox>
      </div>
    </div>
  )
}
