import { signal } from '@pyreon/reactivity'
import { MultiSelect } from '@pyreon/ui-components'

const skills = [
  { value: 'js', label: 'JavaScript' },
  { value: 'ts', label: 'TypeScript' },
  { value: 'py', label: 'Python' },
  { value: 'rs', label: 'Rust' },
  { value: 'go', label: 'Go' },
  { value: 'rb', label: 'Ruby' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
]

export function MultiSelectDemo() {
  const selected = signal<string[]>(['js', 'ts'])

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">MultiSelect</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Tag-based multiple selection with search and removable tags.
      </p>

      {/* Basic multi-select */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic Multi-Select</h3>
      <div style="max-width: 400px; margin-bottom: 32px;">
        <MultiSelect
          options={skills}
          multiple
          value={selected()}
          onChange={(v: string | string[]) => selected.set(v as string[])}
          placeholder="Select skills..."
        >
          {(state: any) => (
            <div style="position: relative;">
              {/* Selected tags + input */}
              <div style="display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 8px; min-height: 42px; align-items: center;">
                {() => {
                  const sel = state.selected() as string[]
                  return sel.map((val: string) => (
                    <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: #e0e7ff; color: #4338ca; border-radius: 4px; font-size: 13px;">
                      {state.getLabel(val)}
                      <button
                        onClick={() => state.remove(val)}
                        style="border: none; background: none; cursor: pointer; color: #6366f1; font-size: 14px; padding: 0 2px; line-height: 1;"
                      >
                        x
                      </button>
                    </span>
                  ))
                }}
                <input
                  type="text"
                  value={state.query()}
                  onInput={(e: Event) => state.setQuery((e.target as HTMLInputElement).value)}
                  onFocus={() => state.open()}
                  onKeyDown={state.onKeyDown}
                  placeholder={(() => { const s = state.selected() as string[]; return s.length === 0 ? 'Select skills...' : '' })()}
                  style="border: none; outline: none; flex: 1; min-width: 80px; font-size: 14px; padding: 2px 4px;"
                />
              </div>
              {/* Dropdown */}
              {() => state.isOpen() ? (
                <div style="position: absolute; top: 100%; left: 0; right: 0; margin-top: 4px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-height: 200px; overflow-y: auto; z-index: 10;">
                  {state.filtered().length > 0
                    ? state.filtered().map((opt: any, i: number) => (
                        <div
                          onClick={() => state.select(opt.value)}
                          style={`padding: 8px 12px; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 8px; ${state.highlightedIndex() === i ? 'background: #f3f4f6;' : ''}`}
                        >
                          <span style={`width: 16px; height: 16px; border: 1px solid #d1d5db; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; ${state.isSelected(opt.value) ? 'background: #4f46e5; border-color: #4f46e5; color: white;' : ''}`}>
                            {state.isSelected(opt.value) ? '✓' : ''}
                          </span>
                          {opt.label}
                        </div>
                      ))
                    : <div style="padding: 8px 12px; color: #9ca3af; font-size: 14px;">No results found</div>
                  }
                </div>
              ) : null}
            </div>
          )}
        </MultiSelect>
        <p style="color: #6b7280; font-size: 14px; margin-top: 8px;">
          Selected: {() => {
            const sel = selected()
            return sel.length > 0 ? sel.map((v) => skills.find((s) => s.value === v)?.label ?? v).join(', ') : '(none)'
          }}
        </p>
      </div>

      {/* With clear all */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Clear All</h3>
      <div style="max-width: 400px; margin-bottom: 32px;">
        <MultiSelect
          options={skills}
          multiple
          defaultValue={['py', 'rs', 'go']}
          placeholder="Select languages..."
        >
          {(state: any) => (
            <div>
              <div style="display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 8px; min-height: 42px; align-items: center;">
                {() => {
                  const sel = state.selected() as string[]
                  return sel.map((val: string) => (
                    <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: #fef3c7; color: #92400e; border-radius: 4px; font-size: 13px;">
                      {state.getLabel(val)}
                      <button
                        onClick={() => state.remove(val)}
                        style="border: none; background: none; cursor: pointer; color: #b45309; font-size: 14px; padding: 0 2px; line-height: 1;"
                      >
                        x
                      </button>
                    </span>
                  ))
                }}
              </div>
              {() => {
                const sel = state.selected() as string[]
                return sel.length > 0 ? (
                  <button
                    onClick={() => state.clear()}
                    style="margin-top: 4px; font-size: 13px; color: #6b7280; border: none; background: none; cursor: pointer; text-decoration: underline;"
                  >
                    Clear all
                  </button>
                ) : null
              }}
            </div>
          )}
        </MultiSelect>
      </div>

      {/* Empty state */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Empty State</h3>
      <div style="max-width: 400px; margin-bottom: 32px;">
        <MultiSelect
          options={skills}
          multiple
          placeholder="Select skills..."
        >
          {(state: any) => (
            <div style="display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 8px; min-height: 42px; align-items: center; color: #9ca3af; font-size: 14px;">
              {() => {
                const sel = state.selected() as string[]
                return sel.length === 0 ? 'No skills selected' : sel.map((val: string) => (
                  <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: #e0e7ff; color: #4338ca; border-radius: 4px; font-size: 13px;">
                    {state.getLabel(val)}
                  </span>
                ))
              }}
            </div>
          )}
        </MultiSelect>
      </div>
    </div>
  )
}
