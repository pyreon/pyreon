import { signal } from '@pyreon/reactivity'
import { Chip } from '@pyreon/ui-components'

export function ChipDemo() {
  const selectedChips = signal<Set<string>>(new Set(['react', 'typescript']))

  const toggleChip = (id: string) => {
    selectedChips.update((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Chip</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Selectable tag-like element. 4 states, 3 sizes, 2 variants with interactive toggle behavior.
      </p>

      {/* States */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">States</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <Chip {...{ state: 'primary' } as any}>Primary</Chip>
          <Chip {...{ state: 'secondary' } as any}>Secondary</Chip>
          <Chip {...{ state: 'success' } as any}>Success</Chip>
          <Chip {...{ state: 'error' } as any}>Error</Chip>
        </div>
      </section>

      {/* Sizes */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <Chip {...{ state: 'primary', size: 'sm' } as any}>Small</Chip>
          <Chip {...{ state: 'primary', size: 'md' } as any}>Medium</Chip>
          <Chip {...{ state: 'primary', size: 'lg' } as any}>Large</Chip>
        </div>
      </section>

      {/* Variants */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Variants</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <Chip {...{ state: 'primary', variant: 'filled' } as any}>Filled</Chip>
          <Chip {...{ state: 'primary', variant: 'outline' } as any}>Outline</Chip>
        </div>
      </section>

      {/* Disabled */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Disabled</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <Chip {...{ state: 'primary', disabled: true } as any}>Primary Disabled</Chip>
          <Chip {...{ state: 'secondary', disabled: true } as any}>Secondary Disabled</Chip>
          <Chip {...{ state: 'success', disabled: true } as any}>Success Disabled</Chip>
          <Chip {...{ state: 'error', disabled: true } as any}>Error Disabled</Chip>
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
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">filled</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">outline</th>
              </tr>
            </thead>
            <tbody>
              {(['primary', 'secondary', 'success', 'error'] as const).map((state) => (
                <tr>
                  <td style="font-size: 12px; font-weight: 600; padding: 4px 8px; color: #6b7280; vertical-align: middle;">{state}</td>
                  {(['filled', 'outline'] as const).map((variant) => (
                    <td style="padding: 4px 8px; text-align: center;">
                      <Chip {...{ state, variant } as any}>{state}</Chip>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* State x Size Matrix */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">State x Size Matrix</h3>
        <div style="overflow-x: auto;">
          <table style="border-collapse: separate; border-spacing: 8px;">
            <thead>
              <tr>
                <th style="font-size: 12px; font-weight: 600; text-align: left; padding: 4px 8px; color: #6b7280;"></th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">sm</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">md</th>
                <th style="font-size: 12px; font-weight: 600; text-align: center; padding: 4px 8px; color: #6b7280;">lg</th>
              </tr>
            </thead>
            <tbody>
              {(['primary', 'secondary', 'success', 'error'] as const).map((state) => (
                <tr>
                  <td style="font-size: 12px; font-weight: 600; padding: 4px 8px; color: #6b7280; vertical-align: middle;">{state}</td>
                  {(['sm', 'md', 'lg'] as const).map((size) => (
                    <td style="padding: 4px 8px; text-align: center;">
                      <Chip {...{ state, size } as any}>{state}</Chip>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Interactive Toggle */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Interactive Toggle</h3>
        <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Click chips to toggle selection:</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          {[
            { id: 'react', label: 'React' },
            { id: 'pyreon', label: 'Pyreon' },
            { id: 'vue', label: 'Vue' },
            { id: 'svelte', label: 'Svelte' },
            { id: 'solid', label: 'Solid' },
            { id: 'typescript', label: 'TypeScript' },
            { id: 'rust', label: 'Rust' },
            { id: 'go', label: 'Go' },
          ].map(({ id, label }) => (
            <Chip
              {...{
                state: selectedChips().has(id) ? 'primary' : 'secondary',
                size: 'md',
                variant: selectedChips().has(id) ? 'filled' : 'outline',
              } as any}
              onClick={() => toggleChip(id)}
            >
              {() => `${selectedChips().has(id) ? '* ' : ''}${label}`}
            </Chip>
          ))}
        </div>
        <p style="font-size: 12px; color: #9ca3af; margin-top: 8px;">
          {() => `Selected: ${[...selectedChips()].join(', ') || 'none'}`}
        </p>
      </section>
    </div>
  )
}
