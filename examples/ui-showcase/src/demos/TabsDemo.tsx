import { signal } from '@pyreon/reactivity'
import { Tabs, Tab, TabPanel, Paragraph } from '@pyreon/ui-components'

export function TabsDemo() {
  const lineTab = signal('tab1')
  const enclosedTab = signal('tab1')
  const pillsTab = signal('tab1')
  const manyTab = signal('tab1')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Tabs</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Controlled tab navigation with Tab, TabPanel, and line/enclosed/pills variants.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Line Variant (default)</h3>
      <div style="margin-bottom: 24px; max-width: 500px;">
        <Tabs value={lineTab()} onChange={(v: string) => lineTab.set(v)}>
          <div style="display: flex; border-bottom: 1px solid #e5e7eb; margin-bottom: 16px;">
            <Tab value="tab1" {...{ variant: 'line' } as any} style="padding: 8px 16px; cursor: pointer;">Overview</Tab>
            <Tab value="tab2" {...{ variant: 'line' } as any} style="padding: 8px 16px; cursor: pointer;">Features</Tab>
            <Tab value="tab3" {...{ variant: 'line' } as any} style="padding: 8px 16px; cursor: pointer;">Pricing</Tab>
          </div>
          <TabPanel value="tab1">
            <Paragraph>Overview content — general information about the product.</Paragraph>
          </TabPanel>
          <TabPanel value="tab2">
            <Paragraph>Features include signals, rocketstyle, SSR, and more.</Paragraph>
          </TabPanel>
          <TabPanel value="tab3">
            <Paragraph>Pyreon is open source and free to use.</Paragraph>
          </TabPanel>
        </Tabs>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Enclosed Variant</h3>
      <div style="margin-bottom: 24px; max-width: 500px;">
        <Tabs value={enclosedTab()} onChange={(v: string) => enclosedTab.set(v)}>
          <div style="display: flex; gap: 4px; margin-bottom: 16px;">
            <Tab value="tab1" {...{ variant: 'enclosed' } as any} style="padding: 8px 16px; cursor: pointer; border: 1px solid transparent; border-bottom: none; border-radius: 8px 8px 0 0;">General</Tab>
            <Tab value="tab2" {...{ variant: 'enclosed' } as any} style="padding: 8px 16px; cursor: pointer; border: 1px solid transparent; border-bottom: none; border-radius: 8px 8px 0 0;">Security</Tab>
            <Tab value="tab3" {...{ variant: 'enclosed' } as any} style="padding: 8px 16px; cursor: pointer; border: 1px solid transparent; border-bottom: none; border-radius: 8px 8px 0 0;">Notifications</Tab>
          </div>
          <TabPanel value="tab1">
            <Paragraph>General settings — manage your profile and preferences.</Paragraph>
          </TabPanel>
          <TabPanel value="tab2">
            <Paragraph>Security settings — two-factor auth, sessions, password.</Paragraph>
          </TabPanel>
          <TabPanel value="tab3">
            <Paragraph>Notification preferences — email, push, SMS.</Paragraph>
          </TabPanel>
        </Tabs>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Pills Variant</h3>
      <div style="margin-bottom: 24px; max-width: 500px;">
        <Tabs value={pillsTab()} onChange={(v: string) => pillsTab.set(v)}>
          <div style="display: flex; gap: 4px; margin-bottom: 16px;">
            <Tab value="tab1" {...{ variant: 'pills' } as any} style="padding: 6px 16px; cursor: pointer; border-radius: 8px;">All</Tab>
            <Tab value="tab2" {...{ variant: 'pills' } as any} style="padding: 6px 16px; cursor: pointer; border-radius: 8px;">Active</Tab>
            <Tab value="tab3" {...{ variant: 'pills' } as any} style="padding: 6px 16px; cursor: pointer; border-radius: 8px;">Archived</Tab>
          </div>
          <TabPanel value="tab1">
            <Paragraph>Showing all items (42 total).</Paragraph>
          </TabPanel>
          <TabPanel value="tab2">
            <Paragraph>Showing active items (28 active).</Paragraph>
          </TabPanel>
          <TabPanel value="tab3">
            <Paragraph>Showing archived items (14 archived).</Paragraph>
          </TabPanel>
        </Tabs>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Many Tabs</h3>
      <div style="margin-bottom: 24px; max-width: 600px;">
        <Tabs value={manyTab()} onChange={(v: string) => manyTab.set(v)}>
          <div style="display: flex; border-bottom: 1px solid #e5e7eb; margin-bottom: 16px; overflow-x: auto;">
            <Tab value="tab1" style="padding: 8px 16px; cursor: pointer; white-space: nowrap;">Dashboard</Tab>
            <Tab value="tab2" style="padding: 8px 16px; cursor: pointer; white-space: nowrap;">Analytics</Tab>
            <Tab value="tab3" style="padding: 8px 16px; cursor: pointer; white-space: nowrap;">Reports</Tab>
            <Tab value="tab4" style="padding: 8px 16px; cursor: pointer; white-space: nowrap;">Users</Tab>
            <Tab value="tab5" style="padding: 8px 16px; cursor: pointer; white-space: nowrap;">Settings</Tab>
            <Tab value="tab6" style="padding: 8px 16px; cursor: pointer; white-space: nowrap;">Integrations</Tab>
          </div>
          <TabPanel value="tab1"><Paragraph>Dashboard overview with metrics.</Paragraph></TabPanel>
          <TabPanel value="tab2"><Paragraph>Analytics and data visualization.</Paragraph></TabPanel>
          <TabPanel value="tab3"><Paragraph>Generated reports and exports.</Paragraph></TabPanel>
          <TabPanel value="tab4"><Paragraph>User management and permissions.</Paragraph></TabPanel>
          <TabPanel value="tab5"><Paragraph>Application settings.</Paragraph></TabPanel>
          <TabPanel value="tab6"><Paragraph>Third-party integrations.</Paragraph></TabPanel>
        </Tabs>
      </div>
    </div>
  )
}
