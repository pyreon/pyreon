import { Col, Container, Row } from '@pyreon/coolgrid'
import { useQuery } from '@pyreon/query'
import { fetchKpis } from './data/api'
import type { Kpi } from './data/types'
import {
  KpiCard,
  KpiDelta,
  KpiLabel,
  KpiValue,
  Skeleton,
  SkeletonValue,
} from './styled'

const SLOTS = [0, 1, 2, 3] as const

/**
 * Top KPI strip — four equal cards laid out via @pyreon/coolgrid.
 *
 * One @pyreon/query call fetches the entire KPI list; the four
 * coolgrid columns each render one KPI from the resolved array. While
 * the query is pending the same layout renders skeleton placeholders
 * so the page doesn't reflow.
 */
export function KpiStrip() {
  const query = useQuery<Kpi[]>(() => ({
    queryKey: ['dashboard', 'kpis'],
    queryFn: fetchKpis,
  }))

  return () => {
    const kpis = query.data() ?? []
    const isLoading = query.isPending()
    return (
      <Container>
        <Row>
          {SLOTS.map((index) => (
            <Col size={3}>
              {() => {
                if (isLoading) return <KpiSkeleton />
                const kpi = kpis[index]
                if (!kpi) return null
                return (
                  <KpiCard>
                    <KpiLabel>{kpi.label}</KpiLabel>
                    <KpiValue>{kpi.value}</KpiValue>
                    <KpiDelta $trend={kpi.trend}>
                      {kpi.trend === 'up' ? '↑' : '↓'} {kpi.delta} vs last period
                    </KpiDelta>
                  </KpiCard>
                )
              }}
            </Col>
          ))}
        </Row>
      </Container>
    )
  }
}

function KpiSkeleton() {
  return (
    <KpiCard>
      <Skeleton $width={60} />
      <SkeletonValue />
      <Skeleton $width={100} />
    </KpiCard>
  )
}
