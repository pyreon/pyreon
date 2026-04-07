import { signal } from '@pyreon/reactivity'
import { TabsBase, TabBase, TabPanelBase } from '@pyreon/ui-primitives'
import { Paragraph } from '@pyreon/ui-components'

export function TabsDemo() {
  const active = signal('overview')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Tabs</h2>

      <TabsBase value={active()} onChange={(v: string) => active.set(v)}>
        <div style="display: flex; border-bottom: 1px solid #e5e7eb; margin-bottom: 16px;">
          <TabBase value="overview" style={() => `padding: 8px 16px; cursor: pointer; border: none; background: none; font-size: 14px; border-bottom: 2px solid ${active() === 'overview' ? '#3b82f6' : 'transparent'}; color: ${active() === 'overview' ? '#3b82f6' : '#6b7280'};`}>
            Overview
          </TabBase>
          <TabBase value="features" style={() => `padding: 8px 16px; cursor: pointer; border: none; background: none; font-size: 14px; border-bottom: 2px solid ${active() === 'features' ? '#3b82f6' : 'transparent'}; color: ${active() === 'features' ? '#3b82f6' : '#6b7280'};`}>
            Features
          </TabBase>
          <TabBase value="pricing" style={() => `padding: 8px 16px; cursor: pointer; border: none; background: none; font-size: 14px; border-bottom: 2px solid ${active() === 'pricing' ? '#3b82f6' : 'transparent'}; color: ${active() === 'pricing' ? '#3b82f6' : '#6b7280'};`}>
            Pricing
          </TabBase>
        </div>
        <TabPanelBase value="overview">
          <Paragraph>Welcome to the overview panel.</Paragraph>
        </TabPanelBase>
        <TabPanelBase value="features">
          <Paragraph>Features include: signals, rocketstyle, SSR, and more.</Paragraph>
        </TabPanelBase>
        <TabPanelBase value="pricing">
          <Paragraph>Pyreon is open source and free to use.</Paragraph>
        </TabPanelBase>
      </TabsBase>
    </div>
  )
}
