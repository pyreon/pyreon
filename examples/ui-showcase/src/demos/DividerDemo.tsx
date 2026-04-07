import { Divider } from '@pyreon/ui-components'

export function DividerDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Divider</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Horizontal rule with configurable style variant and thickness size.
      </p>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Variants</h3>
        <div style="display: flex; flex-direction: column; gap: 24px;">
          <div>
            <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">solid</p>
            <Divider {...{ variant: 'solid', size: 'md' } as any} />
          </div>
          <div>
            <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">dashed</p>
            <Divider {...{ variant: 'dashed', size: 'md' } as any} />
          </div>
          <div>
            <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">dotted</p>
            <Divider {...{ variant: 'dotted', size: 'md' } as any} />
          </div>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
        <div style="display: flex; flex-direction: column; gap: 24px;">
          <div>
            <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">sm (1px)</p>
            <Divider {...{ size: 'sm', variant: 'solid' } as any} />
          </div>
          <div>
            <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">md (2px)</p>
            <Divider {...{ size: 'md', variant: 'solid' } as any} />
          </div>
          <div>
            <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">lg (3px)</p>
            <Divider {...{ size: 'lg', variant: 'solid' } as any} />
          </div>
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size x Variant Matrix</h3>
        <div style="display: grid; grid-template-columns: 80px 1fr 1fr 1fr; gap: 16px; align-items: center;">
          <div></div>
          <p style="font-size: 12px; font-weight: 600; text-align: center;">solid</p>
          <p style="font-size: 12px; font-weight: 600; text-align: center;">dashed</p>
          <p style="font-size: 12px; font-weight: 600; text-align: center;">dotted</p>

          {(['sm', 'md', 'lg'] as const).map((size) => (
            <>
              <p style="font-size: 12px; font-weight: 600;">{size}</p>
              <Divider {...{ size, variant: 'solid' } as any} />
              <Divider {...{ size, variant: 'dashed' } as any} />
              <Divider {...{ size, variant: 'dotted' } as any} />
            </>
          ))}
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">In Context</h3>
        <div style="padding: 16px; background: #f9fafb; border-radius: 8px;">
          <p style="margin-bottom: 12px;">Content above the divider</p>
          <Divider {...{ variant: 'solid', size: 'sm' } as any} />
          <p style="margin-top: 12px; margin-bottom: 12px;">Content between dividers</p>
          <Divider {...{ variant: 'dashed', size: 'sm' } as any} />
          <p style="margin-top: 12px;">Content below the divider</p>
        </div>
      </section>
    </div>
  )
}
