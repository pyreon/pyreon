import { Col, Container, Row } from '@pyreon/coolgrid'
import { PermissionsProvider } from '@pyreon/permissions'
import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { state } from '@pyreon/core/plain'
import { Toaster } from '@pyreon/toast'
import { CategoryChart } from '../../sections/dashboard/CategoryChart'
import { CustomersVirtualList } from '../../sections/dashboard/CustomersVirtualList'
import { KpiStrip } from '../../sections/dashboard/KpiStrip'
import { OrdersTable } from '../../sections/dashboard/OrdersTable'
import { OrdersPlotChart } from '../../sections/dashboard/OrdersPlotChart'
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

type Tab = 'orders' | 'customers'
let activeTab = state<Tab>('orders')

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
  // One QueryClient per mounted dashboard (not per module): a module-level
  // client lives on the server across requests, so a later request renders the
  // CACHED rows while the browser starts empty and the two disagree at hydration.
  // The dashboard owns its providers so other sections do not need @pyreon/query.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Mock API never goes stale, so disable refetch on focus.
        refetchOnWindowFocus: false,
        staleTime: Infinity,
      },
    },
  })
  return (
    <QueryClientProvider client={queryClient}>
      <PermissionsProvider value={dashboardPermissions}>
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
              <Col size={12}>
                <OrdersPlotChart />
              </Col>
            </Row>
          </Container>

          <TabsBar>
            <TabButton
              type="button"
              $active={activeTab === 'orders'}
              onClick={() => { activeTab = 'orders' }}
            >
              Orders
            </TabButton>
            <TabButton
              type="button"
              $active={activeTab === 'customers'}
              onClick={() => { activeTab = 'customers' }}
            >
              Customers
            </TabButton>
          </TabsBar>

          {() => (activeTab === 'orders' ? <OrdersTable /> : <CustomersVirtualList />)}

          <Toaster position="bottom-right" />
        </DashboardPage>
      </PermissionsProvider>
    </QueryClientProvider>
  )
}

export const meta = {
  title: 'Dashboard — Pyreon App Showcase',
}

