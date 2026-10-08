import { PyreonUI } from '@pyreon/ui-core'
import { PieChart } from '@pyreon/charts'
const rows = [{ name: 'one', value: 1 }]
export function ChartScope() {
  return (
    <>
      <PyreonUI mode="dark">
        <PieChart data={rows} nameKey="name" valueKey="value" />
        <PyreonUI mode="light">
          <PieChart data={rows} nameKey="name" valueKey="value" />
        </PyreonUI>
      </PyreonUI>
      <PieChart data={rows} nameKey="name" valueKey="value" />
    </>
  )
}
