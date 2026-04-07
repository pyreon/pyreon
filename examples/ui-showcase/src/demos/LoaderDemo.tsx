import { Loader } from '@pyreon/ui-components'

export function LoaderDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Loader</h2>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">States</h3>
      <div style="display: flex; gap: 24px; align-items: center; margin-bottom: 24px;">
        <Loader state="primary" size="medium" variant="spinner" />
        <Loader state="secondary" size="medium" variant="spinner" />
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Sizes (spinner)</h3>
      <div style="display: flex; gap: 24px; align-items: center; margin-bottom: 24px;">
        <Loader state="primary" size="small" variant="spinner" />
        <Loader state="primary" size="medium" variant="spinner" />
        <Loader state="primary" size="large" variant="spinner" />
        <Loader state="primary" size="xLarge" variant="spinner" />
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Variants</h3>
      <div style="display: flex; gap: 24px; align-items: center; margin-bottom: 24px;">
        <div style="text-align: center;">
          <Loader state="primary" size="large" variant="spinner" />
          <div style="font-size: 12px; margin-top: 8px; color: #6b7280;">Spinner</div>
        </div>
        <div style="text-align: center;">
          <Loader state="primary" size="large" variant="dots" />
          <div style="font-size: 12px; margin-top: 8px; color: #6b7280;">Dots</div>
        </div>
        <div style="text-align: center;">
          <Loader state="primary" size="large" variant="bars" />
          <div style="font-size: 12px; margin-top: 8px; color: #6b7280;">Bars</div>
        </div>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">All Sizes x Variants</h3>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
        <Loader state="primary" size="small" variant="spinner" />
        <Loader state="primary" size="medium" variant="spinner" />
        <Loader state="primary" size="large" variant="spinner" />
        <Loader state="primary" size="xLarge" variant="spinner" />
        <Loader state="primary" size="small" variant="dots" />
        <Loader state="primary" size="medium" variant="dots" />
        <Loader state="primary" size="large" variant="dots" />
        <Loader state="primary" size="xLarge" variant="dots" />
        <Loader state="primary" size="small" variant="bars" />
        <Loader state="primary" size="medium" variant="bars" />
        <Loader state="primary" size="large" variant="bars" />
        <Loader state="primary" size="xLarge" variant="bars" />
      </div>
    </div>
  )
}
