import { signal } from '@pyreon/reactivity'
import { Button } from '@pyreon/ui-components'

export function ButtonDemo() {
  const clickCount = signal(0)

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Button</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        The primary interactive element. Supports 4 states, 5 sizes, 5 variants, disabled state, and content slots.
      </p>

      {/* States */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">States</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <Button {...{ state: 'primary' } as any}>Primary</Button>
          <Button {...{ state: 'secondary' } as any}>Secondary</Button>
          <Button {...{ state: 'danger' } as any}>Danger</Button>
          <Button {...{ state: 'success' } as any}>Success</Button>
        </div>
      </section>

      {/* Sizes */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <Button {...{ state: 'primary', size: 'xs' } as any}>Extra Small</Button>
          <Button {...{ state: 'primary', size: 'sm' } as any}>Small</Button>
          <Button {...{ state: 'primary', size: 'md' } as any}>Medium</Button>
          <Button {...{ state: 'primary', size: 'lg' } as any}>Large</Button>
          <Button {...{ state: 'primary', size: 'xl' } as any}>Extra Large</Button>
        </div>
      </section>

      {/* Variants */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Variants</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <Button {...{ state: 'primary', variant: 'solid' } as any}>Solid</Button>
          <Button {...{ state: 'primary', variant: 'outline' } as any}>Outline</Button>
          <Button {...{ state: 'primary', variant: 'subtle' } as any}>Subtle</Button>
          <Button {...{ state: 'primary', variant: 'ghost' } as any}>Ghost</Button>
          <Button {...{ state: 'primary', variant: 'link' } as any}>Link</Button>
        </div>
      </section>

      {/* Disabled */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Disabled State</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <Button {...{ state: 'primary', disabled: true } as any}>Primary Disabled</Button>
          <Button {...{ state: 'secondary', disabled: true } as any}>Secondary Disabled</Button>
          <Button {...{ state: 'danger', disabled: true } as any}>Danger Disabled</Button>
          <Button {...{ state: 'success', disabled: true } as any}>Success Disabled</Button>
        </div>
      </section>

      {/* With beforeContent/afterContent */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">With Before/After Content</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <Button {...{ state: 'primary', beforeContent: <span>+</span> } as any}>Add Item</Button>
          <Button {...{ state: 'danger', beforeContent: <span>x</span> } as any}>Delete</Button>
          <Button {...{ state: 'success', afterContent: <span>-&gt;</span> } as any}>Next</Button>
          <Button {...{ state: 'secondary', beforeContent: <span>&lt;-</span>, afterContent: <span>-&gt;</span> } as any}>Navigate</Button>
        </div>
      </section>

      {/* Interactive */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Interactive Example</h3>
        <div style="display: flex; gap: 12px; align-items: center;">
          <Button {...{ state: 'primary' } as any} onClick={() => clickCount.update((n) => n + 1)}>
            Click me
          </Button>
          <span style="font-size: 14px; color: #6b7280;">{() => `Clicked ${clickCount()} times`}</span>
        </div>
      </section>

      {/* State x Variant Matrix */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">State x Variant Matrix</h3>
        <div style="overflow-x: auto;">
          <table style="border-collapse: separate; border-spacing: 8px;">
            <thead>
              <tr>
                <th style="font-size: 12px; font-weight: 600; text-align: left; padding: 4px 8px; color: #6b7280;"></th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">solid</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">outline</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">subtle</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">ghost</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">link</th>
              </tr>
            </thead>
            <tbody>
              {(['primary', 'secondary', 'danger', 'success'] as const).map((state) => (
                <tr>
                  <td style="font-size: 12px; font-weight: 600; padding: 4px 8px; color: #6b7280; vertical-align: middle;">{state}</td>
                  {(['solid', 'outline', 'subtle', 'ghost', 'link'] as const).map((variant) => (
                    <td style="padding: 4px 8px; text-align: center;">
                      <Button {...{ state, variant, size: 'sm' } as any}>{state}</Button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Size x State Matrix */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Size x State Matrix</h3>
        <div style="overflow-x: auto;">
          <table style="border-collapse: separate; border-spacing: 8px;">
            <thead>
              <tr>
                <th style="font-size: 12px; font-weight: 600; text-align: left; padding: 4px 8px; color: #6b7280;"></th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">primary</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">secondary</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">danger</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">success</th>
              </tr>
            </thead>
            <tbody>
              {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
                <tr>
                  <td style="font-size: 12px; font-weight: 600; padding: 4px 8px; color: #6b7280; vertical-align: middle;">{size}</td>
                  {(['primary', 'secondary', 'danger', 'success'] as const).map((state) => (
                    <td style="padding: 4px 8px; text-align: center;">
                      <Button {...{ state, size } as any}>Button</Button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Disabled Variants */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Disabled x Variant</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <Button {...{ state: 'primary', variant: 'solid', disabled: true } as any}>Solid</Button>
          <Button {...{ state: 'primary', variant: 'outline', disabled: true } as any}>Outline</Button>
          <Button {...{ state: 'primary', variant: 'subtle', disabled: true } as any}>Subtle</Button>
          <Button {...{ state: 'primary', variant: 'ghost', disabled: true } as any}>Ghost</Button>
          <Button {...{ state: 'primary', variant: 'link', disabled: true } as any}>Link</Button>
        </div>
      </section>
    </div>
  )
}
