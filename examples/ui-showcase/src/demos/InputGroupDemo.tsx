import { InputGroup, Input, Select, FieldLabel } from '@pyreon/ui-components'

export function InputGroupDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">InputGroup</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Compose inputs with prefix and suffix elements for contextual grouping.
      </p>

      {/* With text prefix */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Text Prefix</h3>
      <div style="max-width: 400px; margin-bottom: 32px;">
        <FieldLabel>Website</FieldLabel>
        <InputGroup style="display: flex; align-items: stretch;">
          <span style="display: flex; align-items: center; padding: 0 12px; background: #f3f4f6; border: 1px solid #d1d5db; border-right: none; border-radius: 8px 0 0 8px; font-size: 14px; color: #6b7280;">
            https://
          </span>
          <Input placeholder="example.com" style="border-radius: 0 8px 8px 0; flex: 1;" />
        </InputGroup>
      </div>

      {/* With text suffix */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Text Suffix</h3>
      <div style="max-width: 400px; margin-bottom: 32px;">
        <FieldLabel>Email</FieldLabel>
        <InputGroup style="display: flex; align-items: stretch;">
          <Input placeholder="username" style="border-radius: 8px 0 0 8px; flex: 1;" />
          <span style="display: flex; align-items: center; padding: 0 12px; background: #f3f4f6; border: 1px solid #d1d5db; border-left: none; border-radius: 0 8px 8px 0; font-size: 14px; color: #6b7280;">
            @company.com
          </span>
        </InputGroup>
      </div>

      {/* With icon prefix */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Icon Prefix</h3>
      <div style="max-width: 400px; margin-bottom: 32px;">
        <FieldLabel>Search</FieldLabel>
        <InputGroup style="display: flex; align-items: stretch;">
          <span style="display: flex; align-items: center; padding: 0 10px; background: #f3f4f6; border: 1px solid #d1d5db; border-right: none; border-radius: 8px 0 0 8px; font-size: 16px; color: #9ca3af;">
            Q
          </span>
          <Input placeholder="Search..." style="border-radius: 0 8px 8px 0; flex: 1;" />
        </InputGroup>
      </div>

      {/* With button suffix */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Button Suffix</h3>
      <div style="max-width: 400px; margin-bottom: 32px;">
        <FieldLabel>Invite Code</FieldLabel>
        <InputGroup style="display: flex; align-items: stretch;">
          <Input placeholder="Enter invite code" style="border-radius: 8px 0 0 8px; flex: 1;" />
          <button style="padding: 0 16px; background: #3b82f6; color: white; border: 1px solid #3b82f6; border-radius: 0 8px 8px 0; cursor: pointer; font-size: 14px; font-weight: 500;">
            Apply
          </button>
        </InputGroup>
      </div>

      {/* With select prefix */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Select Prefix</h3>
      <div style="max-width: 400px; margin-bottom: 32px;">
        <FieldLabel>Phone Number</FieldLabel>
        <InputGroup style="display: flex; align-items: stretch;">
          <select style="padding: 0 8px; border: 1px solid #d1d5db; border-right: none; border-radius: 8px 0 0 8px; background: #f3f4f6; font-size: 14px; color: #374151; outline: none;">
            <option>+1</option>
            <option>+44</option>
            <option>+420</option>
            <option>+49</option>
          </select>
          <Input type="tel" placeholder="555-0123" style="border-radius: 0 8px 8px 0; flex: 1;" />
        </InputGroup>
      </div>

      {/* Both prefix and suffix */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Prefix + Suffix</h3>
      <div style="max-width: 400px; margin-bottom: 32px;">
        <FieldLabel>Price</FieldLabel>
        <InputGroup style="display: flex; align-items: stretch;">
          <span style="display: flex; align-items: center; padding: 0 12px; background: #f3f4f6; border: 1px solid #d1d5db; border-right: none; border-radius: 8px 0 0 8px; font-size: 14px; color: #6b7280;">
            $
          </span>
          <Input type="number" placeholder="0.00" style="border-radius: 0; flex: 1;" />
          <span style="display: flex; align-items: center; padding: 0 12px; background: #f3f4f6; border: 1px solid #d1d5db; border-left: none; border-radius: 0 8px 8px 0; font-size: 14px; color: #6b7280;">
            USD
          </span>
        </InputGroup>
      </div>

      {/* Sizes */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Size Variations</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; max-width: 400px;">
        <InputGroup style="display: flex; align-items: stretch;">
          <span style="display: flex; align-items: center; padding: 0 8px; background: #f3f4f6; border: 1px solid #d1d5db; border-right: none; border-radius: 6px 0 0 6px; font-size: 12px; color: #6b7280;">@</span>
          <Input size="sm" placeholder="Small group" style="border-radius: 0 6px 6px 0; flex: 1;" />
        </InputGroup>
        <InputGroup style="display: flex; align-items: stretch;">
          <span style="display: flex; align-items: center; padding: 0 12px; background: #f3f4f6; border: 1px solid #d1d5db; border-right: none; border-radius: 8px 0 0 8px; font-size: 14px; color: #6b7280;">@</span>
          <Input size="md" placeholder="Medium group" style="border-radius: 0 8px 8px 0; flex: 1;" />
        </InputGroup>
        <InputGroup style="display: flex; align-items: stretch;">
          <span style="display: flex; align-items: center; padding: 0 14px; background: #f3f4f6; border: 1px solid #d1d5db; border-right: none; border-radius: 10px 0 0 10px; font-size: 16px; color: #6b7280;">@</span>
          <Input size="lg" placeholder="Large group" style="border-radius: 0 10px 10px 0; flex: 1;" />
        </InputGroup>
      </div>
    </div>
  )
}
