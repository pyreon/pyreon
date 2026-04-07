import { Progress } from '@pyreon/ui-components'

export function ProgressDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Progress</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Progress bars with states, sizes, and various fill percentages.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">States</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; max-width: 500px; margin-bottom: 24px;">
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 6px;">Primary</p>
          <Progress {...{ state: 'primary' } as any}>
            <div data-part="bar" style="width: 60%; height: 100%; border-radius: inherit;" />
          </Progress>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 6px;">Success</p>
          <Progress {...{ state: 'success' } as any}>
            <div data-part="bar" style="width: 80%; height: 100%; border-radius: inherit;" />
          </Progress>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 6px;">Error</p>
          <Progress {...{ state: 'error' } as any}>
            <div data-part="bar" style="width: 35%; height: 100%; border-radius: inherit;" />
          </Progress>
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; max-width: 500px; margin-bottom: 24px;">
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 6px;">Small (sm)</p>
          <Progress {...{ state: 'primary', size: 'sm' } as any}>
            <div data-part="bar" style="width: 50%; height: 100%; border-radius: inherit;" />
          </Progress>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 6px;">Medium (md)</p>
          <Progress {...{ state: 'primary', size: 'md' } as any}>
            <div data-part="bar" style="width: 50%; height: 100%; border-radius: inherit;" />
          </Progress>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 6px;">Large (lg)</p>
          <Progress {...{ state: 'primary', size: 'lg' } as any}>
            <div data-part="bar" style="width: 50%; height: 100%; border-radius: inherit;" />
          </Progress>
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Fill Widths</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; max-width: 500px; margin-bottom: 24px;">
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 6px;">25%</p>
          <Progress {...{ state: 'primary', size: 'md' } as any}>
            <div data-part="bar" style="width: 25%; height: 100%; border-radius: inherit;" />
          </Progress>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 6px;">50%</p>
          <Progress {...{ state: 'primary', size: 'md' } as any}>
            <div data-part="bar" style="width: 50%; height: 100%; border-radius: inherit;" />
          </Progress>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 6px;">75%</p>
          <Progress {...{ state: 'success', size: 'md' } as any}>
            <div data-part="bar" style="width: 75%; height: 100%; border-radius: inherit;" />
          </Progress>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 6px;">100%</p>
          <Progress {...{ state: 'success', size: 'md' } as any}>
            <div data-part="bar" style="width: 100%; height: 100%; border-radius: inherit;" />
          </Progress>
        </div>
      </div>
    </div>
  )
}
