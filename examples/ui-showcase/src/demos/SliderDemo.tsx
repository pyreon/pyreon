import { signal } from '@pyreon/reactivity'
import { Slider, FieldLabel } from '@pyreon/ui-components'

export function SliderDemo() {
  const volume = signal(50)
  const brightness = signal(75)
  const temperature = signal(22)

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Slider</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Range slider with controlled value, live display, sizes, and min/max/step configuration.
      </p>

      {/* Controlled with live display */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Controlled with Live Value</h3>
      <div style="max-width: 400px; margin-bottom: 32px;">
        <FieldLabel>Volume: {() => volume()}</FieldLabel>
        <Slider
          value={volume()}
          onChange={(v: number) => volume.set(v)}
          min={0}
          max={100}
        />
      </div>

      {/* Sizes */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px; max-width: 400px;">
        <div>
          <FieldLabel>Small</FieldLabel>
          <Slider size="sm" defaultValue={30} />
        </div>
        <div>
          <FieldLabel>Medium (default)</FieldLabel>
          <Slider size="md" defaultValue={50} />
        </div>
        <div>
          <FieldLabel>Large</FieldLabel>
          <Slider size="lg" defaultValue={70} />
        </div>
      </div>

      {/* Custom range */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Custom Min/Max</h3>
      <div style="max-width: 400px; margin-bottom: 32px;">
        <FieldLabel>Temperature: {() => temperature()}C</FieldLabel>
        <Slider
          value={temperature()}
          onChange={(v: number) => temperature.set(v)}
          min={-10}
          max={40}
        />
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: #9ca3af;">
          <span>-10C</span>
          <span>40C</span>
        </div>
      </div>

      {/* Step */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Step</h3>
      <div style="max-width: 400px; margin-bottom: 32px;">
        <FieldLabel>Brightness: {() => brightness()}%</FieldLabel>
        <Slider
          value={brightness()}
          onChange={(v: number) => brightness.set(v)}
          min={0}
          max={100}
          step={5}
        />
        <p style="color: #6b7280; font-size: 13px; margin-top: 4px;">Step: 5</p>
      </div>

      {/* Disabled */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Disabled</h3>
      <div style="max-width: 400px; margin-bottom: 32px;">
        <Slider disabled defaultValue={60} />
      </div>

      {/* Multiple sliders */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Multiple Sliders</h3>
      <div style="max-width: 400px; margin-bottom: 32px;">
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <FieldLabel>R: {() => volume()}</FieldLabel>
            <Slider value={volume()} onChange={(v: number) => volume.set(v)} min={0} max={255} />
          </div>
          <div>
            <FieldLabel>G: {() => brightness()}</FieldLabel>
            <Slider value={brightness()} onChange={(v: number) => brightness.set(v)} min={0} max={255} />
          </div>
          <div>
            <FieldLabel>B: {() => temperature()}</FieldLabel>
            <Slider value={temperature()} onChange={(v: number) => temperature.set(v)} min={0} max={255} />
          </div>
        </div>
      </div>
    </div>
  )
}
