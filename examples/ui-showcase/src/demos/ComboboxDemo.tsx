import { signal } from '@pyreon/reactivity'
import { Combobox } from '@pyreon/ui-components'

const fruits = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'date', label: 'Date' },
  { value: 'elderberry', label: 'Elderberry' },
  { value: 'fig', label: 'Fig' },
  { value: 'grape', label: 'Grape' },
  { value: 'honeydew', label: 'Honeydew' },
]

const frameworks = [
  { value: 'pyreon', label: 'Pyreon' },
  { value: 'react', label: 'React' },
  { value: 'vue', label: 'Vue' },
  { value: 'solid', label: 'SolidJS' },
  { value: 'svelte', label: 'Svelte' },
  { value: 'angular', label: 'Angular' },
]

export function ComboboxDemo() {
  const selected = signal('')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Combobox</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Searchable dropdown with filtered options list.
      </p>

      {/* Basic search */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic Search</h3>
      <div style="max-width: 300px; margin-bottom: 32px;">
        <Combobox
          options={fruits}
          value={selected()}
          onChange={(v: string | string[]) => selected.set(v as string)}
          placeholder="Search fruits..."
        >
          {(state: any) => (
            <div style="position: relative;">
              <input
                type="text"
                value={state.query()}
                onInput={(e: Event) => state.setQuery((e.target as HTMLInputElement).value)}
                onFocus={() => state.open()}
                onKeyDown={state.onKeyDown}
                placeholder="Search fruits..."
                style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; outline: none; font-size: 14px;"
              />
              {() => state.isOpen() && state.filtered().length > 0 ? (
                <div style="position: absolute; top: 100%; left: 0; right: 0; margin-top: 4px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-height: 200px; overflow-y: auto; z-index: 10;">
                  {state.filtered().map((opt: any, i: number) => (
                    <div
                      onClick={() => state.select(opt.value)}
                      style={`padding: 8px 12px; cursor: pointer; font-size: 14px; ${state.highlightedIndex() === i ? 'background: #f3f4f6;' : ''} ${state.isSelected(opt.value) ? 'font-weight: 600; color: #3b82f6;' : ''}`}
                    >
                      {opt.label}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </Combobox>
        <p style="color: #6b7280; font-size: 14px; margin-top: 8px;">
          Selected: {() => selected() || '(none)'}
        </p>
      </div>

      {/* Framework selector */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Framework Selector</h3>
      <div style="max-width: 300px; margin-bottom: 32px;">
        <Combobox
          options={frameworks}
          placeholder="Pick a framework..."
        >
          {(state: any) => (
            <div style="position: relative;">
              <input
                type="text"
                value={state.query()}
                onInput={(e: Event) => state.setQuery((e.target as HTMLInputElement).value)}
                onFocus={() => state.open()}
                onKeyDown={state.onKeyDown}
                placeholder="Pick a framework..."
                style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; outline: none; font-size: 14px;"
              />
              {() => state.isOpen() ? (
                <div style="position: absolute; top: 100%; left: 0; right: 0; margin-top: 4px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-height: 200px; overflow-y: auto; z-index: 10;">
                  {state.filtered().length > 0
                    ? state.filtered().map((opt: any, i: number) => (
                        <div
                          onClick={() => state.select(opt.value)}
                          style={`padding: 8px 12px; cursor: pointer; font-size: 14px; ${state.highlightedIndex() === i ? 'background: #f3f4f6;' : ''}`}
                        >
                          {opt.label}
                        </div>
                      ))
                    : <div style="padding: 8px 12px; color: #9ca3af; font-size: 14px;">No results found</div>
                  }
                </div>
              ) : null}
            </div>
          )}
        </Combobox>
      </div>

      {/* Disabled options */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Disabled Options</h3>
      <div style="max-width: 300px; margin-bottom: 32px;">
        <Combobox
          options={[
            { value: 'free', label: 'Free Plan' },
            { value: 'pro', label: 'Pro Plan' },
            { value: 'enterprise', label: 'Enterprise Plan', disabled: true },
          ]}
          placeholder="Choose a plan..."
        >
          {(state: any) => (
            <div style="position: relative;">
              <input
                type="text"
                value={state.query()}
                onInput={(e: Event) => state.setQuery((e.target as HTMLInputElement).value)}
                onFocus={() => state.open()}
                onKeyDown={state.onKeyDown}
                placeholder="Choose a plan..."
                style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; outline: none; font-size: 14px;"
              />
              {() => state.isOpen() ? (
                <div style="position: absolute; top: 100%; left: 0; right: 0; margin-top: 4px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 10;">
                  {state.filtered().map((opt: any, i: number) => (
                    <div
                      onClick={() => !opt.disabled && state.select(opt.value)}
                      style={`padding: 8px 12px; font-size: 14px; ${opt.disabled ? 'color: #d1d5db; cursor: not-allowed;' : 'cursor: pointer;'} ${state.highlightedIndex() === i && !opt.disabled ? 'background: #f3f4f6;' : ''}`}
                    >
                      {opt.label}{opt.disabled ? ' (unavailable)' : ''}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </Combobox>
      </div>
    </div>
  )
}
