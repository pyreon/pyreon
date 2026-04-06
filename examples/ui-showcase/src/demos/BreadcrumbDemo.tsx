import { Breadcrumb, BreadcrumbItem } from '@pyreon/ui-components'

export function BreadcrumbDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Breadcrumb</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Multi-level breadcrumb navigation showing the current page hierarchy.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Two Levels</h3>
      <div style="margin-bottom: 24px;">
        <Breadcrumb>
          <BreadcrumbItem>Home</BreadcrumbItem>
          <span style="color: #9ca3af;">/</span>
          <BreadcrumbItem style="color: #111827; font-weight: 500;">Dashboard</BreadcrumbItem>
        </Breadcrumb>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Three Levels</h3>
      <div style="margin-bottom: 24px;">
        <Breadcrumb>
          <BreadcrumbItem>Home</BreadcrumbItem>
          <span style="color: #9ca3af;">/</span>
          <BreadcrumbItem>Products</BreadcrumbItem>
          <span style="color: #9ca3af;">/</span>
          <BreadcrumbItem style="color: #111827; font-weight: 500;">Widget Pro</BreadcrumbItem>
        </Breadcrumb>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Deep Hierarchy</h3>
      <div style="margin-bottom: 24px;">
        <Breadcrumb>
          <BreadcrumbItem>Home</BreadcrumbItem>
          <span style="color: #9ca3af;">/</span>
          <BreadcrumbItem>Settings</BreadcrumbItem>
          <span style="color: #9ca3af;">/</span>
          <BreadcrumbItem>Account</BreadcrumbItem>
          <span style="color: #9ca3af;">/</span>
          <BreadcrumbItem>Security</BreadcrumbItem>
          <span style="color: #9ca3af;">/</span>
          <BreadcrumbItem style="color: #111827; font-weight: 500;">Two-Factor Auth</BreadcrumbItem>
        </Breadcrumb>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Custom Separator</h3>
      <div style="margin-bottom: 24px;">
        <Breadcrumb>
          <BreadcrumbItem>Docs</BreadcrumbItem>
          <span style="color: #9ca3af; font-size: 12px;">&gt;</span>
          <BreadcrumbItem>Components</BreadcrumbItem>
          <span style="color: #9ca3af; font-size: 12px;">&gt;</span>
          <BreadcrumbItem style="color: #111827; font-weight: 500;">Breadcrumb</BreadcrumbItem>
        </Breadcrumb>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Truncation</h3>
      <div style="margin-bottom: 24px;">
        <Breadcrumb>
          <BreadcrumbItem>Home</BreadcrumbItem>
          <span style="color: #9ca3af;">/</span>
          <BreadcrumbItem style="color: #9ca3af;">...</BreadcrumbItem>
          <span style="color: #9ca3af;">/</span>
          <BreadcrumbItem>Components</BreadcrumbItem>
          <span style="color: #9ca3af;">/</span>
          <BreadcrumbItem style="color: #111827; font-weight: 500;">Breadcrumb</BreadcrumbItem>
        </Breadcrumb>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Linked Breadcrumb</h3>
      <div style="margin-bottom: 24px;">
        <Breadcrumb>
          <BreadcrumbItem style="cursor: pointer; text-decoration: underline;">Home</BreadcrumbItem>
          <span style="color: #9ca3af;">/</span>
          <BreadcrumbItem style="cursor: pointer; text-decoration: underline;">Users</BreadcrumbItem>
          <span style="color: #9ca3af;">/</span>
          <BreadcrumbItem style="cursor: pointer; text-decoration: underline;">Alice Johnson</BreadcrumbItem>
          <span style="color: #9ca3af;">/</span>
          <BreadcrumbItem style="color: #111827; font-weight: 500;">Settings</BreadcrumbItem>
        </Breadcrumb>
      </div>
    </div>
  )
}
