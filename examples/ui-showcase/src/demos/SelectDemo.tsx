import { signal } from '@pyreon/reactivity'
import { Select, Title } from '@pyreon/ui-components'

export function SelectDemo() {
  const country = signal('')

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Select</Title>

      <div style="max-width: 400px; margin-bottom: 24px;">
        <Select
          value={country()}
          onChange={(v: string) => country.set(v)}
          placeholder="Choose a country"
        >
          <option value="us">United States</option>
          <option value="uk">United Kingdom</option>
          <option value="cz">Czech Republic</option>
          <option value="de">Germany</option>
        </Select>
        <p style="font-size: 13px; color: #6b7280; margin-top: 8px;">
          Selected: {() => country() || '(none)'}
        </p>
      </div>
    </div>
  )
}
