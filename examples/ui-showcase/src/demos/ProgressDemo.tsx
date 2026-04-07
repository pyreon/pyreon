import { Progress } from '@pyreon/ui-components'

export function ProgressDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Progress</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">States</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <div>
          <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Primary (60%)</div>
          <Progress state="primary" size="medium">
            <div style="width: 60%; height: 100%; background: currentColor; border-radius: inherit;" />
          </Progress>
        </div>
        <div>
          <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Success (80%)</div>
          <Progress state="success" size="medium">
            <div style="width: 80%; height: 100%; background: currentColor; border-radius: inherit;" />
          </Progress>
        </div>
        <div>
          <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Error (30%)</div>
          <Progress state="error" size="medium">
            <div style="width: 30%; height: 100%; background: currentColor; border-radius: inherit;" />
          </Progress>
        </div>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <div>
          <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Small</div>
          <Progress state="primary" size="small">
            <div style="width: 50%; height: 100%; background: currentColor; border-radius: inherit;" />
          </Progress>
        </div>
        <div>
          <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Medium</div>
          <Progress state="primary" size="medium">
            <div style="width: 50%; height: 100%; background: currentColor; border-radius: inherit;" />
          </Progress>
        </div>
        <div>
          <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Large</div>
          <Progress state="primary" size="large">
            <div style="width: 50%; height: 100%; background: currentColor; border-radius: inherit;" />
          </Progress>
        </div>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Various Percentages</h3>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px;">
        <Progress state="primary" size="medium">
          <div style="width: 10%; height: 100%; background: currentColor; border-radius: inherit;" />
        </Progress>
        <Progress state="primary" size="medium">
          <div style="width: 25%; height: 100%; background: currentColor; border-radius: inherit;" />
        </Progress>
        <Progress state="primary" size="medium">
          <div style="width: 50%; height: 100%; background: currentColor; border-radius: inherit;" />
        </Progress>
        <Progress state="primary" size="medium">
          <div style="width: 75%; height: 100%; background: currentColor; border-radius: inherit;" />
        </Progress>
        <Progress state="primary" size="medium">
          <div style="width: 100%; height: 100%; background: currentColor; border-radius: inherit;" />
        </Progress>
      </div>
    </div>
  )
}
