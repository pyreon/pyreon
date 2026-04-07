import { Breadcrumb, BreadcrumbItem } from '@pyreon/ui-components'

export function BreadcrumbDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Breadcrumb</h2>

      <div style="margin-bottom: 24px;">
        <Breadcrumb gap="small">
          <BreadcrumbItem>Home</BreadcrumbItem>
          <span style="color: #9ca3af;">/</span>
          <BreadcrumbItem>Products</BreadcrumbItem>
          <span style="color: #9ca3af;">/</span>
          <BreadcrumbItem>Widget Pro</BreadcrumbItem>
        </Breadcrumb>
      </div>
    </div>
  )
}
