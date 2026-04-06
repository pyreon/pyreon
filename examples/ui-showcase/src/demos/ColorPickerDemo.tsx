import { signal } from '@pyreon/reactivity'
import { ColorPicker } from '@pyreon/ui-components'

export function ColorPickerDemo() {
  const color = signal('#3b82f6')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">ColorPicker</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Interactive color selection with hex value display and HSB controls.
      </p>

      {/* Basic color picker */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic Color Picker</h3>
      <div style="max-width: 300px; margin-bottom: 32px;">
        <ColorPicker
          value={color()}
          onChange={(hex: string) => color.set(hex)}
        >
          {(state: any) => (
            <div style="display: flex; flex-direction: column; gap: 12px;">
              {/* Color preview */}
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style={`width: 48px; height: 48px; border-radius: 8px; border: 1px solid #d1d5db; background: ${state.hex()};`} />
                <div>
                  <p style="font-weight: 600; font-size: 16px;">{() => state.hex()}</p>
                  <p style="color: #6b7280; font-size: 13px;">
                    {() => { const rgb = state.rgb(); return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` }}
                  </p>
                </div>
              </div>
              {/* Hex input */}
              <div>
                <label style="font-size: 13px; color: #6b7280; display: block; margin-bottom: 4px;">Hex</label>
                <input
                  type="text"
                  value={state.hex()}
                  onInput={(e: Event) => state.setHex((e.target as HTMLInputElement).value)}
                  style="width: 100%; padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-family: monospace; font-size: 14px;"
                />
              </div>
              {/* Hue slider */}
              <div>
                <label style="font-size: 13px; color: #6b7280; display: block; margin-bottom: 4px;">
                  Hue: {() => Math.round(state.hue())}
                </label>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={state.hue()}
                  onInput={(e: Event) => state.setHSB(Number((e.target as HTMLInputElement).value), state.saturation(), state.brightness())}
                  style="width: 100%;"
                />
              </div>
              {/* Saturation slider */}
              <div>
                <label style="font-size: 13px; color: #6b7280; display: block; margin-bottom: 4px;">
                  Saturation: {() => Math.round(state.saturation())}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={state.saturation()}
                  onInput={(e: Event) => state.setHSB(state.hue(), Number((e.target as HTMLInputElement).value), state.brightness())}
                  style="width: 100%;"
                />
              </div>
              {/* Brightness slider */}
              <div>
                <label style="font-size: 13px; color: #6b7280; display: block; margin-bottom: 4px;">
                  Brightness: {() => Math.round(state.brightness())}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={state.brightness()}
                  onInput={(e: Event) => state.setHSB(state.hue(), state.saturation(), Number((e.target as HTMLInputElement).value))}
                  style="width: 100%;"
                />
              </div>
            </div>
          )}
        </ColorPicker>
      </div>

      {/* Preset colors */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Preset Swatches</h3>
      <div style="max-width: 300px; margin-bottom: 32px;">
        <ColorPicker
          value={color()}
          onChange={(hex: string) => color.set(hex)}
        >
          {(state: any) => (
            <div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
                {['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#000000'].map((c) => (
                  <button
                    onClick={() => state.setHex(c)}
                    style={`width: 32px; height: 32px; border-radius: 6px; background: ${c}; border: 2px solid ${state.hex() === c ? '#111' : 'transparent'}; cursor: pointer; transition: border-color 0.15s;`}
                  />
                ))}
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style={`width: 32px; height: 32px; border-radius: 6px; border: 1px solid #d1d5db; background: ${state.hex()};`} />
                <input
                  type="text"
                  value={state.hex()}
                  onInput={(e: Event) => state.setHex((e.target as HTMLInputElement).value)}
                  style="flex: 1; padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-family: monospace; font-size: 14px;"
                />
              </div>
            </div>
          )}
        </ColorPicker>
      </div>

      {/* Multiple pickers */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Theme Colors</h3>
      <div style="display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 32px;">
        {[
          { label: 'Primary', defaultColor: '#3b82f6' },
          { label: 'Success', defaultColor: '#22c55e' },
          { label: 'Danger', defaultColor: '#ef4444' },
        ].map((item) => (
          <div style="width: 140px;">
            <ColorPicker defaultValue={item.defaultColor}>
              {(state: any) => (
                <div>
                  <p style="font-size: 13px; font-weight: 500; margin-bottom: 4px;">{item.label}</p>
                  <div style={`width: 100%; height: 40px; border-radius: 8px; border: 1px solid #d1d5db; margin-bottom: 4px; background: ${state.hex()};`} />
                  <p style="font-family: monospace; font-size: 12px; color: #6b7280; text-align: center;">{() => state.hex()}</p>
                </div>
              )}
            </ColorPicker>
          </div>
        ))}
      </div>
    </div>
  )
}
