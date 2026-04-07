import { Divider } from '@pyreon/ui-components'

export function DividerDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Divider</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;">
        <div><p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">small</p><Divider size="small" /></div>
        <div><p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">medium</p><Divider size="medium" /></div>
        <div><p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">large</p><Divider size="large" /></div>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Variants</h3>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;">
        <div><p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">solid</p><Divider variant="solid" /></div>
        <div><p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">dashed</p><Divider variant="dashed" /></div>
        <div><p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">dotted</p><Divider variant="dotted" /></div>
      </div>
    </div>
  )
}
