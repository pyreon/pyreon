import { signal } from '@pyreon/reactivity'
import { Select, FieldLabel } from '@pyreon/ui-components'

export function SelectDemo() {
  const country = signal('')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Select</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Dropdown select with options, sizes, states, and placeholder support.
      </p>

      {/* Basic */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic</h3>
      <div style="max-width: 300px; margin-bottom: 32px;">
        <FieldLabel>Country</FieldLabel>
        <Select
          placeholder="Choose a country"
          value={country()}
          onChange={(e: Event) => country.set((e.target as HTMLSelectElement).value)}
        >
          <option value="us">United States</option>
          <option value="uk">United Kingdom</option>
          <option value="cz">Czech Republic</option>
          <option value="de">Germany</option>
          <option value="fr">France</option>
        </Select>
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">
          Selected: {() => country() || '(none)'}
        </p>
      </div>

      {/* Sizes */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; max-width: 300px;">
        <div>
          <FieldLabel>Small</FieldLabel>
          <Select size="sm" placeholder="Small select">
            <option value="a">Option A</option>
            <option value="b">Option B</option>
          </Select>
        </div>
        <div>
          <FieldLabel>Medium (default)</FieldLabel>
          <Select size="md" placeholder="Medium select">
            <option value="a">Option A</option>
            <option value="b">Option B</option>
          </Select>
        </div>
        <div>
          <FieldLabel>Large</FieldLabel>
          <Select size="lg" placeholder="Large select">
            <option value="a">Option A</option>
            <option value="b">Option B</option>
          </Select>
        </div>
      </div>

      {/* Error state */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Error State</h3>
      <div style="max-width: 300px; margin-bottom: 32px;">
        <FieldLabel>Category</FieldLabel>
        <Select {...{ state: 'error' } as any} placeholder="Please select a category">
          <option value="tech">Technology</option>
          <option value="design">Design</option>
          <option value="marketing">Marketing</option>
        </Select>
      </div>

      {/* Disabled */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Disabled</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; max-width: 300px;">
        <Select disabled placeholder="Disabled empty">
          <option value="a">Option A</option>
        </Select>
        <Select disabled value="pre">
          <option value="pre">Pre-selected Value</option>
          <option value="other">Other</option>
        </Select>
      </div>

      {/* With option groups */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Option Groups</h3>
      <div style="max-width: 300px; margin-bottom: 32px;">
        <FieldLabel>Framework</FieldLabel>
        <Select placeholder="Pick a framework">
          <optgroup label="Signal-based">
            <option value="pyreon">Pyreon</option>
            <option value="solid">SolidJS</option>
          </optgroup>
          <optgroup label="VDOM-based">
            <option value="react">React</option>
            <option value="vue">Vue</option>
          </optgroup>
        </Select>
      </div>
    </div>
  )
}
