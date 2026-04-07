import { signal } from '@pyreon/reactivity'
import { Slider, Title } from '@pyreon/ui-components'

function SliderField(props: { label: string; min: number; max: number; step?: number; defaultValue?: number; unit?: string }) {
  const value = signal(props.defaultValue ?? props.min)

  return (
    <div style="margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <label style="font-size: 13px; font-weight: 500; color: #374151;">{props.label}</label>
        <span style="font-size: 13px; color: #6b7280;">{value()}{props.unit ?? ''}</span>
      </div>
      <Slider
        value={value()}
        onChange={(v: number) => value.set(v)}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
      />
      <div style="display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; margin-top: 2px;">
        <span>{props.min}</span>
        <span>{props.max}</span>
      </div>
    </div>
  )
}

export function SliderDemo() {
  const volume = signal(50)

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Slider</Title>

      <div style="max-width: 400px;">
        <Title size="h3" style="margin-bottom: 12px">Basic</Title>
        <div style="margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <label style="font-size: 13px; font-weight: 500; color: #374151;">Volume</label>
            <span style="font-size: 13px; color: #6b7280;">{volume()}%</span>
          </div>
          <Slider
            value={volume()}
            onChange={(v: number) => volume.set(v)}
            min={0}
            max={100}
          />
        </div>

        <Title size="h3" style="margin-bottom: 12px">Multiple Sliders</Title>
        <SliderField label="Brightness" min={0} max={100} defaultValue={75} unit="%" />
        <SliderField label="Contrast" min={0} max={200} defaultValue={100} unit="%" />
        <SliderField label="Saturation" min={0} max={200} defaultValue={100} unit="%" />
        <SliderField label="Temperature" min={2000} max={10000} defaultValue={6500} unit="K" step={100} />

        <Title size="h3" style="margin-bottom: 12px">Custom Step</Title>
        <SliderField label="Quantity" min={0} max={50} defaultValue={5} step={5} />
        <SliderField label="Opacity" min={0} max={1} defaultValue={1} step={0.1} />
      </div>
    </div>
  )
}
