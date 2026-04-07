import { Loader } from '@pyreon/ui-components'

export function LoaderDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Loader</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">States</h3>
      <div style="display: flex; gap: 24px; align-items: center; margin-bottom: 24px;">
        <Loader state="primary" size="medium" />
        <Loader state="secondary" size="medium" />
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; gap: 24px; align-items: center; margin-bottom: 24px;">
        <Loader state="primary" size="small" />
        <Loader state="primary" size="medium" />
        <Loader state="primary" size="large" />
        <Loader state="primary" size="xLarge" />
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">All States x Sizes</h3>
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
