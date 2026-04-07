import { signal } from '@pyreon/reactivity'
import { SliderBase } from '@pyreon/ui-primitives'

function SliderField(props: { label: string; min: number; max: number; step?: number; defaultValue?: number; unit?: string }) {
  const value = signal(props.defaultValue ?? props.min)

  return (
    <div style="margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <label style="font-size: 13px; font-weight: 500; color: #374151;">{props.label}</label>
        <span style="font-size: 13px; color: #6b7280;">{() => String(value())}{props.unit ?? ''}</span>
      </div>
      <SliderBase
        value={value()}
        onChange={(v: number) => value.set(v)}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        style="width: 100%; cursor: pointer; accent-color: #3b82f6;"
      />
      <div style="display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; margin-top: 2px;">
        <span>{String(props.min)}</span>
        <span>{String(props.max)}</span>
      </div>
    </div>
  )
}

export function SliderDemo() {
  const volume = signal(50)
  const brightness = signal(75)

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Slider</h2>

      <div style="max-width: 400px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Basic</h3>
        <div style="margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <label style="font-size: 13px; font-weight: 500; color: #374151;">Volume</label>
            <span style="font-size: 13px; color: #6b7280;">{() => String(volume())}%</span>
          </div>
          <SliderBase
            value={volume()}
            onChange={(v: number) => volume.set(v)}
            min={0}
            max={100}
            style="width: 100%; cursor: pointer; accent-color: #3b82f6;"
          />
        </div>

        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Multiple Sliders</h3>
        <SliderField label="Brightness" min={0} max={100} defaultValue={75} unit="%" />
        <SliderField label="Contrast" min={0} max={200} defaultValue={100} unit="%" />
        <SliderField label="Saturation" min={0} max={200} defaultValue={100} unit="%" />
        <SliderField label="Temperature" min={2000} max={10000} defaultValue={6500} unit="K" step={100} />

        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Custom Step</h3>
        <SliderField label="Quantity" min={0} max={50} defaultValue={5} step={5} />
        <SliderField label="Opacity" min={0} max={1} defaultValue={1} step={0.1} />
      </div>
    </div>
  )
}
