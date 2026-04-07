import { signal } from '@pyreon/reactivity'
import { Title } from '@pyreon/ui-components'
import { ColorPickerBase } from '@pyreon/ui-primitives'
import type { ColorPickerState } from '@pyreon/ui-primitives'

export function ColorPickerDemo() {
  const color = signal('#3b82f6')

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Color Picker</Title>

      <ColorPickerBase value={color()} onChange={(hex: string) => color.set(hex)}>
        {(state: ColorPickerState) => (
          <div style="max-width: 280px;">
            <div
              style={() => `width: 100%; height: 160px; border-radius: 8px; margin-bottom: 12px; background: linear-gradient(to right, white, hsl(${state.hue()}, 100%, 50%)), linear-gradient(to top, black, transparent); background-blend-mode: multiply; cursor: crosshair;`}
              onClick={(e: MouseEvent) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                const s = ((e.clientX - rect.left) / rect.width) * 100
                const b = (1 - (e.clientY - rect.top) / rect.height) * 100
                state.setHSB(state.hue(), s, b)
              }}
            />

            <input
              type="range"
              min="0"
              max="360"
              value={state.hue()}
              onInput={(e: Event) => {
                state.setHSB(Number((e.target as HTMLInputElement).value), state.saturation(), state.brightness())
              }}
              style="width: 100%; margin-bottom: 12px;"
            />

            <div style="display: flex; align-items: center; gap: 12px;">
              <div style={() => `width: 40px; height: 40px; border-radius: 8px; background: ${state.hex()}; border: 1px solid #e5e7eb;`} />
              <input
                type="text"
                value={state.hex()}
                onInput={(e: Event) => state.setHex((e.target as HTMLInputElement).value)}
                style="flex: 1; padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-family: monospace;"
              />
            </div>

            <p style="font-size: 12px; color: #6b7280; margin-top: 8px;">
              HSB: {() => `${Math.round(state.hue())}° ${Math.round(state.saturation())}% ${Math.round(state.brightness())}%`}
            </p>
          </div>
        )}
      </ColorPickerBase>
    </div>
  )
}
