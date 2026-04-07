import { signal } from '@pyreon/reactivity'
import {
  Card,
  Paragraph,
  Badge,
  Button,
  Input,
  Select,
  Table,
  Pagination,
  ActionIcon,
  Loader,
} from '@pyreon/ui-components'

interface Employee {
  id: number
  name: string
  email: string
  department: string
  status: 'Active' | 'On Leave' | 'Terminated'
  role: string
  joinDate: string
}

const allEmployees: Employee[] = [
  { id: 1, name: 'Alice Johnson', email: 'alice@company.com', department: 'Engineering', status: 'Active', role: 'Senior Engineer', joinDate: '2022-03-15' },
  { id: 2, name: 'Bob Smith', email: 'bob@company.com', department: 'Design', status: 'Active', role: 'Lead Designer', joinDate: '2021-07-01' },
  { id: 3, name: 'Carol White', email: 'carol@company.com', department: 'Engineering', status: 'On Leave', role: 'Staff Engineer', joinDate: '2020-11-20' },
  { id: 4, name: 'Dave Brown', email: 'dave@company.com', department: 'Marketing', status: 'Active', role: 'Marketing Manager', joinDate: '2023-01-10' },
  { id: 5, name: 'Eve Davis', email: 'eve@company.com', department: 'Engineering', status: 'Active', role: 'Junior Engineer', joinDate: '2024-06-01' },
  { id: 6, name: 'Frank Miller', email: 'frank@company.com', department: 'Sales', status: 'Terminated', role: 'Sales Rep', joinDate: '2021-09-15' },
  { id: 7, name: 'Grace Lee', email: 'grace@company.com', department: 'Engineering', status: 'Active', role: 'DevOps Engineer', joinDate: '2022-12-01' },
  { id: 8, name: 'Henry Wilson', email: 'henry@company.com', department: 'Design', status: 'Active', role: 'UX Researcher', joinDate: '2023-04-20' },
  { id: 9, name: 'Ivy Chen', email: 'ivy@company.com', department: 'Engineering', status: 'Active', role: 'Frontend Engineer', joinDate: '2023-08-15' },
  { id: 10, name: 'Jack Taylor', email: 'jack@company.com', department: 'Marketing', status: 'On Leave', role: 'Content Writer', joinDate: '2024-01-05' },
  { id: 11, name: 'Karen Adams', email: 'karen@company.com', department: 'Sales', status: 'Active', role: 'Account Executive', joinDate: '2022-05-10' },
  { id: 12, name: 'Leo Martinez', email: 'leo@company.com', department: 'Engineering', status: 'Active', role: 'Backend Engineer', joinDate: '2021-03-01' },
]

const PAGE_SIZE = 5

const statusState = (status: string) => {
  if (status === 'Active') return 'success'
  if (status === 'On Leave') return 'warning'
  return 'danger'
}

export function DataTableDemo() {
  const search = signal('')
  const statusFilter = signal('all')
  const currentPage = signal(1)
  const sortField = signal<string>('name')
  const sortDir = signal<'asc' | 'desc'>('asc')
  const loading = signal(false)

  const filteredEmployees = () => {
    let list = allEmployees

    // Search filter
    const q = search().toLowerCase()
    if (q) {
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q) ||
          e.department.toLowerCase().includes(q) ||
          e.role.toLowerCase().includes(q),
      )
    }

    // Status filter
    if (statusFilter() !== 'all') {
      list = list.filter((e) => e.status === statusFilter())
    }

    // Sort
    const field = sortField()
    const dir = sortDir()
    list = [...list].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[field] as string
      const bVal = (b as Record<string, unknown>)[field] as string
      const cmp = aVal.localeCompare(bVal)
      return dir === 'asc' ? cmp : -cmp
    })

    return list
  }

  const totalPages = () => Math.max(1, Math.ceil(filteredEmployees().length / PAGE_SIZE))

  const paginatedEmployees = () => {
    const start = (currentPage() - 1) * PAGE_SIZE
    return filteredEmployees().slice(start, start + PAGE_SIZE)
  }

  const handleSort = (field: string) => {
    if (sortField() === field) {
      sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      sortField.set(field)
      sortDir.set('asc')
    }
  }

  const sortIndicator = (field: string) => {
    if (sortField() !== field) return ' \u2195'
    return sortDir() === 'asc' ? ' \u2191' : ' \u2193'
  }

  const simulateRefresh = () => {
    loading.set(true)
    setTimeout(() => loading.set(false), 1500)
  }

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Data Table</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        A full data table with search, status filter, sortable columns, pagination, loader overlay, and row actions.
      </p>

      <div style="max-width: 960px;">
        <Card {...{ variant: 'elevated' } as any}>
          {/* Toolbar */}
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 12px; flex-wrap: wrap;">
            <div style="display: flex; gap: 12px; align-items: center; flex: 1; min-width: 200px;">
              <div style="flex: 1; max-width: 300px;">
                <Input
                  {...{ size: 'sm' } as any}
                  placeholder="Search employees..."
                  value={search()}
                  onInput={(e: Event) => {
                    search.set((e.target as HTMLInputElement).value)
                    currentPage.set(1)
                  }}
                />
              </div>
              <div style="width: 160px;">
                <Select
                  {...{ size: 'sm' } as any}
                  value={statusFilter()}
                  onChange={(v: string) => {
                    statusFilter.set(v)
                    currentPage.set(1)
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Terminated">Terminated</option>
                </Select>
              </div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <Paragraph {...{ size: 'sm', style: 'color: #6b7280;' } as any}>
                {() => `${filteredEmployees().length} results`}
              </Paragraph>
              <Button
                {...{ state: 'secondary', variant: 'outline', size: 'sm' } as any}
                onClick={simulateRefresh}
              >
                Refresh
              </Button>
            </div>
          </div>

          {/* Table with loader overlay */}
          <div style="position: relative;">
            {() =>
              loading() ? (
                <div style="position: absolute; inset: 0; background: rgba(255, 255, 255, 0.8); display: flex; align-items: center; justify-content: center; z-index: 10; border-radius: 8px;">
                  <Loader {...{ size: 'lg' } as any} />
                </div>
              ) : null
            }

            <Table>
              <thead>
                <tr style="border-bottom: 2px solid #e5e7eb;">
                  <th
                    style="text-align: left; padding: 10px 12px; font-weight: 600; cursor: pointer; user-select: none;"
                    onClick={() => handleSort('name')}
                  >
                    Name{() => sortIndicator('name')}
                  </th>
                  <th style="text-align: left; padding: 10px 12px; font-weight: 600;">Email</th>
                  <th
                    style="text-align: left; padding: 10px 12px; font-weight: 600; cursor: pointer; user-select: none;"
                    onClick={() => handleSort('department')}
                  >
                    Department{() => sortIndicator('department')}
                  </th>
                  <th
                    style="text-align: left; padding: 10px 12px; font-weight: 600; cursor: pointer; user-select: none;"
                    onClick={() => handleSort('role')}
                  >
                    Role{() => sortIndicator('role')}
                  </th>
                  <th
                    style="text-align: left; padding: 10px 12px; font-weight: 600; cursor: pointer; user-select: none;"
                    onClick={() => handleSort('status')}
                  >
                    Status{() => sortIndicator('status')}
                  </th>
                  <th style="text-align: right; padding: 10px 12px; font-weight: 600;">Actions</th>
                </tr>
              </thead>
              <tbody>
                {() =>
                  paginatedEmployees().length === 0 ? (
                    <tr>
                      <td colspan="6" style="text-align: center; padding: 32px; color: #9ca3af;">
                        No employees match your search criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedEmployees().map((emp) => (
                      <tr style="border-bottom: 1px solid #f3f4f6;">
                        <td style="padding: 10px 12px; font-weight: 500;">{emp.name}</td>
                        <td style="padding: 10px 12px; color: #6b7280; font-size: 13px;">{emp.email}</td>
                        <td style="padding: 10px 12px;">{emp.department}</td>
                        <td style="padding: 10px 12px; font-size: 13px;">{emp.role}</td>
                        <td style="padding: 10px 12px;">
                          <Badge {...{ state: statusState(emp.status), size: 'sm' } as any}>{emp.status}</Badge>
                        </td>
                        <td style="padding: 10px 12px; text-align: right;">
                          <div style="display: flex; gap: 4px; justify-content: flex-end;">
                            <ActionIcon {...{ state: 'secondary', size: 'sm', variant: 'ghost' } as any} aria-label="Edit">
                              <span style="font-size: 14px;">✎</span>
                            </ActionIcon>
                            <ActionIcon {...{ state: 'danger', size: 'sm', variant: 'ghost' } as any} aria-label="Delete">
                              <span style="font-size: 14px;">✕</span>
                            </ActionIcon>
                          </div>
                        </td>
                      </tr>
                    ))
                  )
                }
              </tbody>
            </Table>
          </div>

          {/* Pagination */}
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px;">
            <Paragraph {...{ size: 'sm', style: 'color: #6b7280;' } as any}>
              {() => {
                const total = filteredEmployees().length
                const start = (currentPage() - 1) * PAGE_SIZE + 1
                const end = Math.min(currentPage() * PAGE_SIZE, total)
                return `Showing ${start}-${end} of ${total}`
              }}
            </Paragraph>
            <Pagination
              {...{
                total: totalPages(),
                value: currentPage(),
                onChange: (page: number) => currentPage.set(page),
                size: 'sm',
              } as any}
            />
          </div>
        </Card>
      </div>
    </div>
  )
}
