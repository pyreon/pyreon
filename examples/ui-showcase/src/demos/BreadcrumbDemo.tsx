import { Breadcrumb, BreadcrumbItem, Title } from '@pyreon/ui-components'

export function BreadcrumbDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Breadcrumb</Title>

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
