import { Loader, Title } from '@pyreon/ui-components'

export function LoaderDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Loader</Title>

      <Title size="h3" style="margin-bottom: 12px">States</Title>
      <div style="display: flex; gap: 24px; align-items: center; margin-bottom: 24px;">
        <Loader state="primary" size="medium" />
        <Loader state="secondary" size="medium" />
      </div>

      <Title size="h3" style="margin-bottom: 12px">Sizes</Title>
      <div style="display: flex; gap: 24px; align-items: center; margin-bottom: 24px;">
        <Loader state="primary" size="small" />
        <Loader state="primary" size="medium" />
        <Loader state="primary" size="large" />
        <Loader state="primary" size="xLarge" />
      </div>

      <Title size="h3" style="margin-bottom: 12px">All States x Sizes</Title>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; align-items: center; margin-bottom: 24px;">
        <Loader state="primary" size="small" />
        <Loader state="primary" size="medium" />
        <Loader state="primary" size="large" />
        <Loader state="primary" size="xLarge" />
        <Loader state="secondary" size="small" />
        <Loader state="secondary" size="medium" />
        <Loader state="secondary" size="large" />
        <Loader state="secondary" size="xLarge" />
      </div>
    </div>
  )
}
