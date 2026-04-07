import { signal } from '@pyreon/reactivity'
import { Tabs, Tab, TabPanel, Paragraph, Title } from '@pyreon/ui-components'

export function TabsDemo() {
  const active = signal('overview')

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Tabs</Title>

      <Tabs value={active()} onChange={(v: string) => active.set(v)}>
        <div style="display: flex; margin-bottom: 16px;">
          <Tab value="overview">Overview</Tab>
          <Tab value="features">Features</Tab>
          <Tab value="pricing">Pricing</Tab>
        </div>
        <TabPanel value="overview">
          <Paragraph>Welcome to the overview panel.</Paragraph>
        </TabPanel>
        <TabPanel value="features">
          <Paragraph>Features include: signals, rocketstyle, SSR, and more.</Paragraph>
        </TabPanel>
        <TabPanel value="pricing">
          <Paragraph>Pyreon is open source and free to use.</Paragraph>
        </TabPanel>
      </Tabs>
    </div>
  )
}
