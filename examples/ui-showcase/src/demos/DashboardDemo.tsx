import {
  Card,
  Title,
  Paragraph,
  Badge,
  Progress,
  Table,
  Alert,
  Avatar,
} from '@pyreon/ui-components'

const stats = [
  { label: 'Total Users', value: '12,847', change: '+12.5%', positive: true },
  { label: 'Revenue', value: '$48,290', change: '+8.2%', positive: true },
  { label: 'Active Sessions', value: '1,024', change: '-3.1%', positive: false },
  { label: 'Conversion Rate', value: '3.24%', change: '+0.8%', positive: true },
]

const users = [
  { name: 'Alice Johnson', email: 'alice@example.com', role: 'Admin', status: 'Active' },
  { name: 'Bob Smith', email: 'bob@example.com', role: 'Editor', status: 'Active' },
  { name: 'Carol White', email: 'carol@example.com', role: 'Viewer', status: 'Away' },
  { name: 'Dave Brown', email: 'dave@example.com', role: 'Editor', status: 'Offline' },
  { name: 'Eve Davis', email: 'eve@example.com', role: 'Admin', status: 'Active' },
  { name: 'Frank Miller', email: 'frank@example.com', role: 'Viewer', status: 'Away' },
]

const goals = [
  { label: 'Monthly Revenue', current: 48290, target: 60000 },
  { label: 'New Signups', current: 342, target: 500 },
  { label: 'Customer Satisfaction', current: 87, target: 95 },
]

const statusColor = (status: string) => {
  if (status === 'Active') return 'success'
  if (status === 'Away') return 'warning'
  return 'danger'
}

export function DashboardDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Dashboard</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        A dashboard layout combining stat Cards, Progress bars, Table, Alert, and Badge components.
      </p>

      {/* System Alert */}
      <div style="margin-bottom: 24px;">
        <Alert {...{ state: 'info' } as any}>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 600;">System Notice:</span>
            <span>Scheduled maintenance on April 12, 2026 from 2:00 AM to 4:00 AM UTC.</span>
          </div>
        </Alert>
      </div>

      {/* Stat Cards Row */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Key Metrics</h3>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
          {stats.map((stat) => (
            <Card {...{ variant: 'outline' } as any}>
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <Paragraph {...{ size: 'sm', style: 'color: #6b7280;' } as any}>{stat.label}</Paragraph>
                <Badge {...{ state: stat.positive ? 'success' : 'danger', size: 'sm' } as any}>
                  {stat.change}
                </Badge>
              </div>
              <Title {...{ size: 'h3', style: 'margin-top: 4px;' } as any}>{stat.value}</Title>
              <Paragraph {...{ size: 'sm', style: `margin-top: 8px; color: ${stat.positive ? '#10b981' : '#ef4444'};` } as any}>
                {stat.change} from last month
              </Paragraph>
            </Card>
          ))}
        </div>
      </section>

      {/* Goals / Progress */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Goals Progress</h3>
        <Card {...{ variant: 'elevated' } as any}>
          <div style="display: flex; flex-direction: column; gap: 20px;">
            {goals.map((goal) => {
              const pct = Math.round((goal.current / goal.target) * 100)
              return (
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <Paragraph {...{ size: 'sm', style: 'font-weight: 500;' } as any}>{goal.label}</Paragraph>
                    <Paragraph {...{ size: 'sm', style: 'color: #6b7280;' } as any}>
                      {goal.current.toLocaleString()} / {goal.target.toLocaleString()} ({pct}%)
                    </Paragraph>
                  </div>
                  <Progress
                    {...{
                      value: pct,
                      state: pct >= 80 ? 'success' : pct >= 50 ? 'primary' : 'warning',
                      size: 'md',
                    } as any}
                  />
                </div>
              )
            })}
          </div>
        </Card>
      </section>

      {/* Users Table */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Team Members</h3>
        <Card {...{ variant: 'outline' } as any}>
          <Table>
            <thead>
              <tr style="border-bottom: 2px solid #e5e7eb;">
                <th style="text-align: left; padding: 10px 12px; font-weight: 600;">User</th>
                <th style="text-align: left; padding: 10px 12px; font-weight: 600;">Email</th>
                <th style="text-align: left; padding: 10px 12px; font-weight: 600;">Role</th>
                <th style="text-align: left; padding: 10px 12px; font-weight: 600;">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 12px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <Avatar {...{ size: 'sm' } as any}>{user.name.charAt(0)}</Avatar>
                      <span style="font-weight: 500;">{user.name}</span>
                    </div>
                  </td>
                  <td style="padding: 10px 12px; color: #6b7280;">{user.email}</td>
                  <td style="padding: 10px 12px;">
                    <Badge {...{ state: 'secondary', size: 'sm', variant: 'subtle' } as any}>{user.role}</Badge>
                  </td>
                  <td style="padding: 10px 12px;">
                    <Badge {...{ state: statusColor(user.status), size: 'sm' } as any}>{user.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </section>

      {/* Additional Alerts */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Notifications</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <Alert {...{ state: 'success' } as any}>
            <span style="font-weight: 500;">Deployment successful</span> — v2.4.1 deployed to production at 14:32 UTC.
          </Alert>
          <Alert {...{ state: 'warning' } as any}>
            <span style="font-weight: 500;">Storage quota at 85%</span> — consider upgrading your plan or cleaning old assets.
          </Alert>
          <Alert {...{ state: 'danger' } as any}>
            <span style="font-weight: 500;">3 failed login attempts</span> — detected from IP 192.168.1.42 in the last hour.
          </Alert>
        </div>
      </section>
    </div>
  )
}
