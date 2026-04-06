import { ColorSwatch } from '@pyreon/ui-components'

export function ColorSwatchDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">ColorSwatch</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Small color indicator squares in multiple sizes and colors.
      </p>

      {/* Basic colors */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic Colors</h3>
      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 32px;">
        {['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e'].map((color) => (
          <ColorSwatch style={`width: 32px; height: 32px; border-radius: 6px; background: ${color};`} />
        ))}
      </div>

      {/* Sizes */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px;">
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Small</p>
          <div style="display: flex; gap: 6px;">
            {['#ef4444', '#22c55e', '#3b82f6', '#8b5cf6', '#f97316'].map((color) => (
              <ColorSwatch size="sm" style={`width: 20px; height: 20px; border-radius: 4px; background: ${color};`} />
            ))}
          </div>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Medium (default)</p>
          <div style="display: flex; gap: 8px;">
            {['#ef4444', '#22c55e', '#3b82f6', '#8b5cf6', '#f97316'].map((color) => (
              <ColorSwatch size="md" style={`width: 32px; height: 32px; border-radius: 6px; background: ${color};`} />
            ))}
          </div>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Large</p>
          <div style="display: flex; gap: 10px;">
            {['#ef4444', '#22c55e', '#3b82f6', '#8b5cf6', '#f97316'].map((color) => (
              <ColorSwatch size="lg" style={`width: 48px; height: 48px; border-radius: 8px; background: ${color};`} />
            ))}
          </div>
        </div>
      </div>

      {/* Rounded shapes */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Circular Swatches</h3>
      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 32px;">
        {['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'].map((color) => (
          <ColorSwatch style={`width: 32px; height: 32px; border-radius: 50%; background: ${color};`} />
        ))}
      </div>

      {/* With border */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Border (for light colors)</h3>
      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 32px;">
        {['#ffffff', '#fef3c7', '#ecfdf5', '#eff6ff', '#fdf2f8', '#f5f3ff', '#f0fdf4'].map((color) => (
          <ColorSwatch style={`width: 32px; height: 32px; border-radius: 6px; background: ${color}; border: 1px solid #e5e7eb;`} />
        ))}
      </div>

      {/* Color palette */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Color Palette</h3>
      <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 32px;">
        {[
          { name: 'Red', shades: ['#fef2f2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b'] },
          { name: 'Blue', shades: ['#eff6ff', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af'] },
          { name: 'Green', shades: ['#f0fdf4', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534'] },
        ].map((palette) => (
          <div>
            <p style="font-size: 12px; color: #6b7280; margin-bottom: 2px;">{palette.name}</p>
            <div style="display: flex; gap: 2px;">
              {palette.shades.map((color) => (
                <ColorSwatch style={`width: 40px; height: 28px; background: ${color};`} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Inline with text */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Inline with Text</h3>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 32px;">
        {[
          { label: 'Primary', color: '#3b82f6' },
          { label: 'Success', color: '#22c55e' },
          { label: 'Warning', color: '#eab308' },
          { label: 'Danger', color: '#ef4444' },
        ].map((item) => (
          <div style="display: flex; align-items: center; gap: 8px;">
            <ColorSwatch style={`width: 16px; height: 16px; border-radius: 4px; background: ${item.color};`} />
            <span style="font-size: 14px;">{item.label}</span>
            <span style="font-family: monospace; font-size: 12px; color: #6b7280;">{item.color}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
