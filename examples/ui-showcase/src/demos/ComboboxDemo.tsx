import { signal } from '@pyreon/reactivity'
import { MenuItem } from '@pyreon/ui-components'
import { ComboboxBase } from '@pyreon/ui-primitives'
import type { ComboboxState } from '@pyreon/ui-primitives'

const options = [
  { value: 'react', label: 'React' },
  { value: 'pyreon', label: 'Pyreon' },
  { value: 'vue', label: 'Vue' },
  { value: 'svelte', label: 'Svelte' },
  { value: 'solid', label: 'SolidJS' },
  { value: 'angular', label: 'Angular' },
]

export function ComboboxDemo() {
  const selected = signal('')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Combobox</h2>

      <div style="max-width: 300px; margin-bottom: 24px;">
        <ComboboxBase
          options={options}
          value={selected()}
          onChange={(v: string | string[]) => selected.set(v as string)}
          placeholder="Search framework..."
        >
          {(state: ComboboxState) => (
            <div style="position: relative;">
              <input
                type="text"
                value={state.query()}
                onInput={(e: Event) => state.setQuery((e.target as HTMLInputElement).value)}
                onFocus={() => state.open()}
                onKeyDown={state.onKeyDown}
                placeholder="Search framework..."
                style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; outline: none;"
              />
              {() => state.isOpen() ? (
                <div style="position: absolute; top: 100%; left: 0; right: 0; margin-top: 4px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-height: 200px; overflow-y: auto; z-index: 10;">
                  {state.filtered().map((opt) => (
                    <MenuItem size="medium" onClick={() => state.select(opt.value)}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </ComboboxBase>
        <p style="font-size: 13px; color: #6b7280; margin-top: 8px;">
          Selected: {() => selected() || '(none)'}
        </p>
      </div>
    </div>
  )
}
