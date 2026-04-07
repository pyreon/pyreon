import { Title } from '@pyreon/ui-components'

const users = [
  { name: 'Alice', email: 'alice@example.com', role: 'Admin', status: 'Active' },
  { name: 'Bob', email: 'bob@example.com', role: 'Editor', status: 'Active' },
  { name: 'Charlie', email: 'charlie@example.com', role: 'Viewer', status: 'Inactive' },
  { name: 'Diana', email: 'diana@example.com', role: 'Editor', status: 'Active' },
  { name: 'Eve', email: 'eve@example.com', role: 'Admin', status: 'Active' },
]

export function TableDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Table</Title>

      <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="text-align: left; padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb;">Name</th>
              <th style="text-align: left; padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb;">Email</th>
              <th style="text-align: left; padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb;">Role</th>
              <th style="text-align: left; padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb;">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 12px 16px; font-weight: 500;">{user.name}</td>
                <td style="padding: 12px 16px; color: #6b7280;">{user.email}</td>
                <td style="padding: 12px 16px;">
                  <span style={`padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: 500; ${user.role === 'Admin' ? 'background: #eff6ff; color: #2563eb;' : user.role === 'Editor' ? 'background: #f0fdf4; color: #16a34a;' : 'background: #f3f4f6; color: #6b7280;'}`}>
                    {user.role}
                  </span>
                </td>
                <td style="padding: 12px 16px;">
                  <span style={`width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; ${user.status === 'Active' ? 'background: #22c55e;' : 'background: #d1d5db;'}`} />
                  {user.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
