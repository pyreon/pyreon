import { signal } from '@pyreon/reactivity'
import {
  Title,
  Tabs,
  Tab,
  TabPanel,
  Breadcrumb,
  BreadcrumbItem,
  NavLink,
  Pagination,
  Stepper,
  Step,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Divider,
  Paragraph,
} from '@pyreon/ui-components'

function SectionTitle(props: { children: any }) {
  return <Title size="h3" style="margin: 24px 0 12px;">{props.children}</Title>
}

export function NavigationSection() {
  const activeTab = signal('tab1')

  return (
    <div style="max-width: 600px;">
      <Title size="h2">Navigation</Title>

      <SectionTitle>Tabs</SectionTitle>
      <Tabs value={activeTab()} onChange={(v: string) => activeTab.set(v)}>
        <div style="display: flex; border-bottom: 1px solid #e5e7eb; margin-bottom: 16px;">
          <Tab value="tab1" style="padding: 8px 16px; cursor: pointer;">Overview</Tab>
          <Tab value="tab2" style="padding: 8px 16px; cursor: pointer;">Features</Tab>
          <Tab value="tab3" style="padding: 8px 16px; cursor: pointer;">Pricing</Tab>
        </div>
        <TabPanel value="tab1">
          <Paragraph>Welcome to the overview panel. This shows general information.</Paragraph>
        </TabPanel>
        <TabPanel value="tab2">
          <Paragraph>Features include: signals, rocketstyle, SSR, and more.</Paragraph>
        </TabPanel>
        <TabPanel value="tab3">
          <Paragraph>Pyreon is open source and free to use.</Paragraph>
        </TabPanel>
      </Tabs>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Breadcrumb</SectionTitle>
      <Breadcrumb>
        <BreadcrumbItem>Home</BreadcrumbItem>
        <span style="color: #9ca3af;">/</span>
        <BreadcrumbItem>Products</BreadcrumbItem>
        <span style="color: #9ca3af;">/</span>
        <BreadcrumbItem style="color: #111827; font-weight: 500;">Widget Pro</BreadcrumbItem>
      </Breadcrumb>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Nav Links</SectionTitle>
      <div style="display: flex; flex-direction: column; gap: 4px; width: 240px;">
        <NavLink state="active">Dashboard</NavLink>
        <NavLink>Users</NavLink>
        <NavLink>Settings</NavLink>
        <NavLink>Analytics</NavLink>
      </div>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Stepper</SectionTitle>
      <Stepper variant="horizontal">
        <Step state="completed">1</Step>
        <Step state="active">2</Step>
        <Step>3</Step>
        <Step>4</Step>
      </Stepper>

      <Divider style="margin: 24px 0;" />

      <SectionTitle>Accordion</SectionTitle>
      <Accordion>
        <AccordionItem>
          <AccordionTrigger>What is Pyreon?</AccordionTrigger>
          <AccordionContent>
            <Paragraph>
              Pyreon is a signal-based UI framework with fine-grained reactivity,
              streaming SSR, and the fastest compile-time JSX transform.
            </Paragraph>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem>
          <AccordionTrigger>How does rocketstyle work?</AccordionTrigger>
          <AccordionContent>
            <Paragraph>
              Rocketstyle is a multi-dimensional styling engine. Define states, sizes,
              and variants as theme objects — they compose automatically with dark mode.
            </Paragraph>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem>
          <AccordionTrigger>Is it production ready?</AccordionTrigger>
          <AccordionContent>
            <Paragraph>
              Yes! 75 components, all accessible, responsive, and theme-driven.
            </Paragraph>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
