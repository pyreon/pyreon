import { Table } from '@pyreon/ui-components'

export function TableDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Table</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Data table with compact/default/relaxed sizes and simple/striped/bordered variants.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Default Table</h3>
      <div style="margin-bottom: 24px;">
        <Table>
          <thead>
            <tr style="border-bottom: 2px solid #e5e7eb;">
              <th style="text-align: left; padding: 8px 12px; font-weight: 600;">Name</th>
              <th style="text-align: left; padding: 8px 12px; font-weight: 600;">Role</th>
              <th style="text-align: left; padding: 8px 12px; font-weight: 600;">Status</th>
              <th style="text-align: right; padding: 8px 12px; font-weight: 600;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 8px 12px;">Alice Johnson</td>
              <td style="padding: 8px 12px;">Engineer</td>
              <td style="padding: 8px 12px;"><span style="color: #16a34a;">Active</span></td>
              <td style="padding: 8px 12px; text-align: right;">Edit</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 8px 12px;">Bob Smith</td>
              <td style="padding: 8px 12px;">Designer</td>
              <td style="padding: 8px 12px;"><span style="color: #16a34a;">Active</span></td>
              <td style="padding: 8px 12px; text-align: right;">Edit</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 8px 12px;">Carol White</td>
              <td style="padding: 8px 12px;">Manager</td>
              <td style="padding: 8px 12px;"><span style="color: #eab308;">Away</span></td>
              <td style="padding: 8px 12px; text-align: right;">Edit</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px;">Dave Brown</td>
              <td style="padding: 8px 12px;">Intern</td>
              <td style="padding: 8px 12px;"><span style="color: #ef4444;">Offline</span></td>
              <td style="padding: 8px 12px; text-align: right;">Edit</td>
            </tr>
          </tbody>
        </Table>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>

      <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Compact</p>
      <div style="margin-bottom: 16px;">
        <Table {...{ size: 'compact' } as any}>
          <thead>
            <tr style="border-bottom: 2px solid #e5e7eb;">
              <th style="text-align: left; padding: 4px 8px; font-weight: 600;">ID</th>
              <th style="text-align: left; padding: 4px 8px; font-weight: 600;">Name</th>
              <th style="text-align: left; padding: 4px 8px; font-weight: 600;">Email</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 4px 8px;">1</td>
              <td style="padding: 4px 8px;">Alice</td>
              <td style="padding: 4px 8px;">alice@example.com</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 4px 8px;">2</td>
              <td style="padding: 4px 8px;">Bob</td>
              <td style="padding: 4px 8px;">bob@example.com</td>
            </tr>
            <tr>
              <td style="padding: 4px 8px;">3</td>
              <td style="padding: 4px 8px;">Carol</td>
              <td style="padding: 4px 8px;">carol@example.com</td>
            </tr>
          </tbody>
        </Table>
      </div>

      <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Relaxed</p>
      <div style="margin-bottom: 24px;">
        <Table {...{ size: 'relaxed' } as any}>
          <thead>
            <tr style="border-bottom: 2px solid #e5e7eb;">
              <th style="text-align: left; padding: 12px 16px; font-weight: 600;">Product</th>
              <th style="text-align: left; padding: 12px 16px; font-weight: 600;">Category</th>
              <th style="text-align: right; padding: 12px 16px; font-weight: 600;">Price</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 12px 16px;">Laptop Pro</td>
              <td style="padding: 12px 16px;">Electronics</td>
              <td style="padding: 12px 16px; text-align: right;">$1,299</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 12px 16px;">Desk Chair</td>
              <td style="padding: 12px 16px;">Furniture</td>
              <td style="padding: 12px 16px; text-align: right;">$499</td>
            </tr>
            <tr>
              <td style="padding: 12px 16px;">Headphones</td>
              <td style="padding: 12px 16px;">Audio</td>
              <td style="padding: 12px 16px; text-align: right;">$249</td>
            </tr>
          </tbody>
        </Table>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Variants</h3>

      <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Simple</p>
      <div style="margin-bottom: 16px;">
        <Table {...{ variant: 'simple' } as any}>
          <thead>
            <tr style="border-bottom: 2px solid #e5e7eb;">
              <th style="text-align: left; padding: 8px 12px; font-weight: 600;">Framework</th>
              <th style="text-align: right; padding: 8px 12px; font-weight: 600;">Stars</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 8px 12px;">Pyreon</td>
              <td style="padding: 8px 12px; text-align: right;">12.4k</td>
            </tr>
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 8px 12px;">React</td>
              <td style="padding: 8px 12px; text-align: right;">220k</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px;">Vue</td>
              <td style="padding: 8px 12px; text-align: right;">207k</td>
            </tr>
          </tbody>
        </Table>
      </div>

      <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Striped</p>
      <div style="margin-bottom: 16px;">
        <Table {...{ variant: 'striped' } as any}>
          <thead>
            <tr style="border-bottom: 2px solid #e5e7eb;">
              <th style="text-align: left; padding: 8px 12px; font-weight: 600;">Month</th>
              <th style="text-align: right; padding: 8px 12px; font-weight: 600;">Revenue</th>
            </tr>
          </thead>
          <tbody>
            <tr style="background-color: #f9fafb;">
              <td style="padding: 8px 12px;">January</td>
              <td style="padding: 8px 12px; text-align: right;">$42,000</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px;">February</td>
              <td style="padding: 8px 12px; text-align: right;">$38,500</td>
            </tr>
            <tr style="background-color: #f9fafb;">
              <td style="padding: 8px 12px;">March</td>
              <td style="padding: 8px 12px; text-align: right;">$51,200</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px;">April</td>
              <td style="padding: 8px 12px; text-align: right;">$47,800</td>
            </tr>
          </tbody>
        </Table>
      </div>

      <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Bordered</p>
      <div style="margin-bottom: 24px;">
        <Table {...{ variant: 'bordered' } as any}>
          <thead>
            <tr>
              <th style="text-align: left; padding: 8px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Task</th>
              <th style="text-align: left; padding: 8px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Assignee</th>
              <th style="text-align: left; padding: 8px 12px; font-weight: 600; border: 1px solid #e5e7eb;">Priority</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">Fix login bug</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">Alice</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #ef4444;">High</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">Add dark mode</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">Bob</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #eab308;">Medium</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">Update docs</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">Carol</td>
              <td style="padding: 8px 12px; border: 1px solid #e5e7eb; color: #16a34a;">Low</td>
            </tr>
          </tbody>
        </Table>
      </div>
    </div>
  )
}
