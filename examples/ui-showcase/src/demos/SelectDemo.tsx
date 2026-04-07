import { signal } from '@pyreon/reactivity'
import { SelectBase } from '@pyreon/ui-primitives'

export function SelectDemo() {
  const country = signal('')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Select</h2>

      <div style="max-width: 400px; margin-bottom: 24px;">
        <SelectBase
          value={country()}
          onChange={(v: string) => country.set(v)}
          placeholder="Choose a country"
          style="width: 100%; padding: 8px 32px 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; outline: none; background: white; cursor: pointer; appearance: none; background-image: url('data:image/svg+xml,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 20 20%27%3e%3cpath stroke=%27%236b7280%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%271.5%27 d=%27M6 8l4 4 4-4%27/%3e%3c/svg%3e'); background-position: right 8px center; background-repeat: no-repeat; background-size: 20px;"
        >
          <option value="us">United States</option>
          <option value="uk">United Kingdom</option>
          <option value="cz">Czech Republic</option>
          <option value="de">Germany</option>
        </SelectBase>
        <p style="font-size: 13px; color: #6b7280; margin-top: 8px;">
          Selected: {() => country() || '(none)'}
        </p>
      </div>
    </div>
  )
}
