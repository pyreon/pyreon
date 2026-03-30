import { createDocument, render } from '@pyreon/document'
import { createMachine } from '@pyreon/machine'
import { createPermissions } from '@pyreon/permissions'
import { computed, signal } from '@pyreon/reactivity'
import { useStorage } from '@pyreon/storage'
import { defineStore } from '@pyreon/store'

/**
 * Integrated Dashboard Demo
 *
 * Uses 6 packages together:
 * - @pyreon/store — dashboard state
 * - @pyreon/permissions — role-based visibility
 * - @pyreon/storage — persist preferences
 * - @pyreon/machine — export workflow state
 * - @pyreon/document — generate reports
 * - @pyreon/reactivity — signals throughout
 */

// ── Store: dashboard data ───────────────────────────────────────────────────

const useDashboard = defineStore('dashboard', () => {
  const salesData = signal([
    { region: 'US', revenue: 1200000, growth: 30 },
    { region: 'EU', revenue: 800000, growth: 15 },
    { region: 'APAC', revenue: 500000, growth: 40 },
    { region: 'LATAM', revenue: 300000, growth: 25 },
  ])

  const totalRevenue = computed(() => salesData().reduce((sum, r) => sum + r.revenue, 0))

  const topRegion = computed(() => {
    const sorted = [...salesData()].sort((a, b) => b.revenue - a.revenue)
    return sorted[0]?.region ?? 'N/A'
  })

  const addSale = (region: string, amount: number) => {
    salesData.update((data) =>
      data.map((r) => (r.region === region ? { ...r, revenue: r.revenue + amount } : r)),
    )
  }

  return { salesData, totalRevenue, topRegion, addSale }
})

// ── Permissions ─────────────────────────────────────────────────────────────

const can = createPermissions({
  'dashboard.view': true,
  'dashboard.export': true,
  'sales.add': true,
  'admin.panel': false,
})

// ── Export workflow machine ──────────────────────────────────────────────────

const exportMachine = createMachine({
  initial: 'idle',
  states: {
    idle: { on: { START: 'choosing' } },
    choosing: { on: { SELECT: 'exporting', CANCEL: 'idle' } },
    exporting: { on: { DONE: 'complete', ERROR: 'idle' } },
    complete: { on: { RESET: 'idle' } },
  },
})

// ── Component ───────────────────────────────────────────────────────────────

export function DashboardDemo() {
  const { store } = useDashboard()
  const theme = useStorage('dashboard-theme', 'light')
  const exportFormat = signal('html')
  const exportResult = signal('')
  const saleRegion = signal('US')
  const saleAmount = signal(10000)

  const handleExport = async () => {
    exportMachine.send('START')
    exportMachine.send('SELECT')

    try {
      const doc = createDocument({ title: 'Sales Dashboard Report' })
        .heading('Sales Dashboard Report')
        .text(`Total Revenue: $${store.totalRevenue().toLocaleString()}`)
        .text(`Top Region: ${store.topRegion()}`)
        .table({
          columns: [
            { header: 'Region', width: '30%' },
            { header: 'Revenue', align: 'right' as const },
            { header: 'Growth', align: 'right' as const },
          ],
          rows: store
            .salesData()
            .map((r) => [r.region, `$${r.revenue.toLocaleString()}`, `${r.growth}%`]),
          striped: true,
          headerStyle: { background: '#1a1a2e', color: '#fff' },
        })

      const format = exportFormat()
      const result = await render(doc.build(), format)
      exportResult.set(
        typeof result === 'string'
          ? result
          : `[Binary ${format.toUpperCase()} — ${result.length} bytes]`,
      )
      exportMachine.send('DONE')
    } catch {
      exportMachine.send('ERROR')
      exportResult.set('Export failed')
    }
  }

  const handleAddSale = () => {
    if (can('sales.add')) {
      store.addSale(saleRegion(), saleAmount())
    }
  }

  return (
    <div>
      <h2>Integrated Dashboard</h2>
      <p style="color: #666; margin-bottom: 16px">
        Uses: store + permissions + storage + machine + document + reactivity
      </p>

      {/* Theme toggle — persisted via @pyreon/storage */}
      <div style="margin-bottom: 16px">
        <strong>Theme (persisted): </strong>
        <button type="button" onClick={() => theme.set(theme() === 'light' ? 'dark' : 'light')}>
          {() => (theme() === 'light' ? '☀️ Light' : '🌙 Dark')}
        </button>
      </div>

      {/* Sales data — from @pyreon/store */}
      <h3>Sales Data</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px">
        <thead>
          <tr style="background: #f5f5f5">
            <th style="padding: 8px; text-align: left">Region</th>
            <th style="padding: 8px; text-align: right">Revenue</th>
            <th style="padding: 8px; text-align: right">Growth</th>
          </tr>
        </thead>
        <tbody>
          {() =>
            store.salesData().map((r) => (
              <tr key={r.region}>
                <td style="padding: 8px">{r.region}</td>
                <td style="padding: 8px; text-align: right">${r.revenue.toLocaleString()}</td>
                <td style="padding: 8px; text-align: right">{r.growth}%</td>
              </tr>
            ))
          }
        </tbody>
      </table>

      <p>
        <strong>Total Revenue: </strong>
        {() => {
          const rev = store.totalRevenue()
          return `$${rev.toLocaleString()}`
        }}
        {' | '}
        <strong>Top Region: </strong>
        {() => store.topRegion()}
      </p>

      {/* Add sale — gated by @pyreon/permissions */}
      {() =>
        can('sales.add') ? (
          <div style="margin: 16px 0; padding: 12px; background: #f9f9f9; border-radius: 4px">
            <h4>Add Sale</h4>
            <select
              value={saleRegion()}
              onChange={(e: Event) => saleRegion.set((e.target as HTMLSelectElement).value)}
            >
              <option value="US">US</option>
              <option value="EU">EU</option>
              <option value="APAC">APAC</option>
              <option value="LATAM">LATAM</option>
            </select>{' '}
            <input
              type="number"
              value={saleAmount()}
              onInput={(e: InputEvent) =>
                saleAmount.set(Number((e.target as HTMLInputElement).value))
              }
              style="width: 100px"
            />{' '}
            <button type="button" onClick={handleAddSale}>
              Add
            </button>
          </div>
        ) : (
          <p style="color: #999">No permission to add sales</p>
        )
      }

      {/* Admin panel — hidden by permissions */}
      {() =>
        can('admin.panel') ? (
          <div style="padding: 12px; background: #fff3cd; border-radius: 4px">
            <h4>Admin Panel</h4>
            <p>Admin-only content</p>
          </div>
        ) : null
      }

      {/* Export — @pyreon/machine workflow + @pyreon/document */}
      {() =>
        can('dashboard.export') ? (
          <div style="margin: 16px 0; padding: 12px; background: #f0f0f0; border-radius: 4px">
            <h4>Export Report</h4>
            <p>
              <strong>Status: </strong>
              {() => exportMachine()}
            </p>

            {() =>
              exportMachine.matches('idle') ? (
                <div>
                  <select
                    value={exportFormat()}
                    onChange={(e: Event) => exportFormat.set((e.target as HTMLSelectElement).value)}
                  >
                    <option value="html">HTML</option>
                    <option value="md">Markdown</option>
                    <option value="text">Plain Text</option>
                    <option value="csv">CSV</option>
                    <option value="email">Email HTML</option>
                  </select>{' '}
                  <button type="button" onClick={handleExport}>
                    Export
                  </button>
                </div>
              ) : exportMachine.matches('choosing', 'exporting') ? (
                <p>Generating...</p>
              ) : exportMachine.matches('complete') ? (
                <div>
                  <p style="color: green">Export complete!</p>
                  <button type="button" onClick={() => exportMachine.send('RESET')}>
                    New Export
                  </button>
                </div>
              ) : null
            }

            {() =>
              exportResult() ? (
                <pre style="margin-top: 12px; padding: 12px; background: #fff; border: 1px solid #ddd; border-radius: 4px; overflow-x: auto; max-height: 300px; font-size: 12px">
                  {exportResult()}
                </pre>
              ) : null
            }
          </div>
        ) : null
      }
    </div>
  )
}
