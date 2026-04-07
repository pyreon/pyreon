import { Divider, Title } from '@pyreon/ui-components'

export function DividerDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Divider</Title>

      <Title size="h3" style="margin-bottom: 12px">Sizes</Title>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;">
        <div><p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">small</p><Divider size="small" /></div>
        <div><p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">medium</p><Divider size="medium" /></div>
        <div><p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">large</p><Divider size="large" /></div>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Variants</Title>
      <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;">
        <div><p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">solid</p><Divider variant="solid" /></div>
        <div><p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">dashed</p><Divider variant="dashed" /></div>
        <div><p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">dotted</p><Divider variant="dotted" /></div>
      </div>
    </div>
  )
}
