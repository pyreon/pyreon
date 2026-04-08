import { Col, Container, Row } from '@pyreon/coolgrid'
import { PermissionsProvider } from '@pyreon/permissions'
import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { Toaster } from '@pyreon/toast'
import { CategoryChart } from '../../sections/dashboard/CategoryChart'
import { CustomersVirtualList } from '../../sections/dashboard/CustomersVirtualList'
import { KpiStrip } from '../../sections/dashboard/KpiStrip'
import { OrdersTable } from '../../sections/dashboard/OrdersTable'
import { RevenueChart } from '../../sections/dashboard/RevenueChart'
import { RoleToggleHeader } from '../../sections/dashboard/RoleToggleHeader'
import { dashboardPermissions } from '../../sections/dashboard/permissions'
import {
  DashboardLead,
  DashboardPage,
  DashboardTitle,
  Header,
  HeaderText,
  TabButton,
  TabsBar,
} from '../../sections/dashboard/styled'

/**
 * The dashboard ships its own QueryClient and Permissions providers
 * scoped to the section. Other sections (todos, blog) don't need
 * @pyreon/query, so providing it at the section level keeps the
 * shell layer slim and avoids forcing every section to think about
 * cache config.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Mock API never goes stale, so disable refetch on focus.
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    },
  },
})

type Tab = 'orders' | 'customers'
const activeTab = signal<Tab>('orders')

/**
 * Dashboard section — exercises @pyreon/query, @pyreon/table,
 * @pyreon/charts, @pyreon/virtual, @pyreon/permissions, @pyreon/toast,
 * @pyreon/coolgrid, @pyreon/url-state, @pyreon/rx in a single page.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────┐
 *   │ Title                                Role toggle   │
 *   ├────────────────────────────────────────────────────┤
 *   │ KPI 1 │ KPI 2 │ KPI 3 │ KPI 4                      │  coolgrid Row
 *   ├──────────────────────┬─────────────────────────────┤
 *   │ Revenue line chart   │ Category bar chart          │  coolgrid Row
 *   ├────────────────────────────────────────────────────┤
 *   │ [Orders] [Customers]                               │  tabs
 *   │                                                    │
 *   │ Orders table OR virtualized customers list         │
 *   └────────────────────────────────────────────────────┘
 */
export default function DashboardPageRoute() {
  return (
    <QueryClientProvider client={queryClient}>
      <PermissionsProvider instance={dashboardPermissions}>
        <DashboardPage>
          <Header>
            <HeaderText>
              <DashboardTitle>Dashboard</DashboardTitle>
              <DashboardLead>
                Mock admin app exercising query, table, charts, virtual, permissions, toast,
                coolgrid, url-state, and rx in one page.
              </DashboardLead>
            </HeaderText>
            <RoleToggleHeader />
          </Header>

          <KpiStrip />

          <Container>
            <Row>
              <Col size={6}>
                <RevenueChart />
              </Col>
              <Col size={6}>
                <CategoryChart />
              </Col>
            </Row>
          </Container>

          <TabsBar>
            <TabButton
              type="button"
              $active={activeTab() === 'orders'}
              onClick={() => activeTab.set('orders')}
            >
              Orders
            </TabButton>
            <TabButton
              type="button"
              $active={activeTab() === 'customers'}
              onClick={() => activeTab.set('customers')}
            >
              Customers
            </TabButton>
          </TabsBar>

          {() => (activeTab() === 'orders' ? <OrdersTable /> : <CustomersVirtualList />)}

          <Toaster position="bottom-right" />
        </DashboardPage>
      </PermissionsProvider>
    </QueryClientProvider>
  )
}

export const meta = {
  title: 'Dashboard — Pyreon App Showcase',
}

