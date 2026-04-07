import { Loader } from '@pyreon/ui-components'

export function LoaderDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Loader</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Loading indicators with multiple states, sizes, and variants.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">States</h3>
      <div style="display: flex; gap: 24px; align-items: center; margin-bottom: 24px;">
        <div style="text-align: center;">
          <Loader {...{ state: 'primary', size: 'md' } as any} />
          <p style="font-size: 12px; color: #6b7280; margin-top: 8px;">Primary</p>
        </div>
        <div style="text-align: center;">
          <Loader {...{ state: 'secondary', size: 'md' } as any} />
          <p style="font-size: 12px; color: #6b7280; margin-top: 8px;">Secondary</p>
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; gap: 24px; align-items: center; margin-bottom: 24px;">
        <div style="text-align: center;">
          <Loader {...{ state: 'primary', size: 'sm' } as any} />
          <p style="font-size: 12px; color: #6b7280; margin-top: 8px;">sm (16px)</p>
        </div>
        <div style="text-align: center;">
          <Loader {...{ state: 'primary', size: 'md' } as any} />
          <p style="font-size: 12px; color: #6b7280; margin-top: 8px;">md (24px)</p>
        </div>
        <div style="text-align: center;">
          <Loader {...{ state: 'primary', size: 'lg' } as any} />
          <p style="font-size: 12px; color: #6b7280; margin-top: 8px;">lg (32px)</p>
        </div>
        <div style="text-align: center;">
          <Loader {...{ state: 'primary', size: 'xl' } as any} />
          <p style="font-size: 12px; color: #6b7280; margin-top: 8px;">xl (48px)</p>
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Variants</h3>
      <div style="display: flex; gap: 32px; align-items: center; margin-bottom: 24px;">
        <div style="text-align: center;">
          <Loader {...{ state: 'primary', size: 'lg', variant: 'spinner' } as any} />
          <p style="font-size: 12px; color: #6b7280; margin-top: 8px;">Spinner</p>
        </div>
        <div style="text-align: center;">
          <Loader {...{ state: 'primary', size: 'lg', variant: 'dots' } as any} />
          <p style="font-size: 12px; color: #6b7280; margin-top: 8px;">Dots</p>
        </div>
        <div style="text-align: center;">
          <Loader {...{ state: 'primary', size: 'lg', variant: 'bars' } as any} />
          <p style="font-size: 12px; color: #6b7280; margin-top: 8px;">Bars</p>
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">All Combinations</h3>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 24px;">
        <div style="text-align: center; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <Loader {...{ state: 'primary', size: 'sm', variant: 'spinner' } as any} />
          <p style="font-size: 11px; color: #9ca3af; margin-top: 8px;">primary / sm / spinner</p>
        </div>
        <div style="text-align: center; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <Loader {...{ state: 'primary', size: 'md', variant: 'dots' } as any} />
          <p style="font-size: 11px; color: #9ca3af; margin-top: 8px;">primary / md / dots</p>
        </div>
        <div style="text-align: center; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <Loader {...{ state: 'primary', size: 'lg', variant: 'bars' } as any} />
          <p style="font-size: 11px; color: #9ca3af; margin-top: 8px;">primary / lg / bars</p>
        </div>
        <div style="text-align: center; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <Loader {...{ state: 'secondary', size: 'sm', variant: 'spinner' } as any} />
          <p style="font-size: 11px; color: #9ca3af; margin-top: 8px;">secondary / sm / spinner</p>
        </div>
        <div style="text-align: center; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <Loader {...{ state: 'secondary', size: 'md', variant: 'dots' } as any} />
          <p style="font-size: 11px; color: #9ca3af; margin-top: 8px;">secondary / md / dots</p>
        </div>
        <div style="text-align: center; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <Loader {...{ state: 'secondary', size: 'xl', variant: 'bars' } as any} />
          <p style="font-size: 11px; color: #9ca3af; margin-top: 8px;">secondary / xl / bars</p>
        </div>
      </div>
    </div>
  )
}
