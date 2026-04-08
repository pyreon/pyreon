import { useDebouncedValue } from '@pyreon/hooks'
import { computed, signal } from '@pyreon/reactivity'
import { DashboardTab } from '../tabs/DashboardTab'

const stats = [
  { label: 'Components', value: '10', change: '+2', trend: 'up' },
  { label: 'Hooks', value: '25+', change: '+5', trend: 'up' },
  { label: 'Presets', value: '122', change: 'stable', trend: 'flat' },
  { label: 'Bundle', value: '~8kb', change: '-12%', trend: 'down' },
]

const recentItems = [
  { name: 'Button', pkg: 'rocketstyle', status: 'stable' },
  { name: 'Element', pkg: 'elements', status: 'stable' },
  { name: 'fade', pkg: 'kinetic', status: 'stable' },
  { name: 'useHover', pkg: 'hooks', status: 'stable' },
  { name: 'Container', pkg: 'coolgrid', status: 'stable' },
  { name: 'styled', pkg: 'styler', status: 'stable' },
]

export default function DashboardRoute() {
  const searchInput = signal('')
  const debouncedSearch = useDebouncedValue(() => searchInput(), 300)

  const filteredItems = computed(() => {
    const q = debouncedSearch().toLowerCase()
    if (!q) return recentItems
    return recentItems.filter(
      (item) => item.name.toLowerCase().includes(q) || item.pkg.toLowerCase().includes(q),
    )
  })

  return (
    <DashboardTab
      stats={stats}
      filteredItems={filteredItems}
      searchInput={searchInput}
      debouncedSearch={debouncedSearch}
    />
  )
}

export const meta = {
  title: 'Dashboard — Pyreon UI System Showcase',
}
