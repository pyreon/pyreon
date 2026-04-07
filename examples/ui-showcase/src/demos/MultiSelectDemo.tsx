import { signal } from '@pyreon/reactivity'
import { MultiSelect } from '@pyreon/ui-components'

const skills = [
  { value: 'js', label: 'JavaScript' },
  { value: 'ts', label: 'TypeScript' },
  { value: 'py', label: 'Python' },
  { value: 'rs', label: 'Rust' },
  { value: 'go', label: 'Go' },
]

export function MultiSelectDemo() {
  const selected = signal<string[]>(['js', 'ts'])

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">MultiSelect</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Tag-based multiple selection with search and removable tags.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic Multi-Select</h3>
      <div style="max-width: 400px; margin-bottom: 32px;">
        <MultiSelect
          options={skills}
          multiple
          value={selected()}
          onChange={(v: string | string[]) => selected.set(v as string[])}
          placeholder="Select skills..."
        >
          {(s: any) => (
            <div>
              <div style="display: flex; flex-wrap: wrap; gap: 4px; padding: 8px; border: 1px solid #d1d5db; border-radius: 8px; min-height: 42px;">
                {() => {
                  const vals = s.selected() as string[]
                  return vals.map((val: string) => (
                    <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: #e0e7ff; color: #4338ca; border-radius: 4px; font-size: 13px;">
                      {s.getLabel(val)}
                      <button
                        onClick={() => s.remove(val)}
                        style="border: none; background: none; cursor: pointer; color: #6366f1; font-size: 14px; padding: 0 2px;"
                      >
                        x
                      </button>
                    </span>
                  ))
                }}
              </div>
            </div>
          )}
        </MultiSelect>
        <p style="color: #6b7280; font-size: 14px; margin-top: 8px;">
          Selected: {() => selected().join(', ') || '(none)'}
        </p>
      </div>
    </div>
  )
}
