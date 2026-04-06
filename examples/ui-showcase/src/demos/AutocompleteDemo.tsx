import { signal } from '@pyreon/reactivity'
import { Autocomplete } from '@pyreon/ui-components'

const countries = [
  { value: 'us', label: 'United States' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'cz', label: 'Czech Republic' },
  { value: 'de', label: 'Germany' },
  { value: 'fr', label: 'France' },
  { value: 'es', label: 'Spain' },
  { value: 'it', label: 'Italy' },
  { value: 'nl', label: 'Netherlands' },
  { value: 'pl', label: 'Poland' },
  { value: 'se', label: 'Sweden' },
  { value: 'no', label: 'Norway' },
  { value: 'dk', label: 'Denmark' },
  { value: 'fi', label: 'Finland' },
  { value: 'pt', label: 'Portugal' },
  { value: 'at', label: 'Austria' },
]

export function AutocompleteDemo() {
  const selected = signal('')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Autocomplete</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Type-ahead search input with filtered suggestions dropdown.
      </p>

      {/* Basic type-ahead */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Type-Ahead Search</h3>
      <div style="max-width: 300px; margin-bottom: 32px;">
        <Autocomplete
          options={countries}
          value={selected()}
          onChange={(v: string | string[]) => selected.set(v as string)}
          placeholder="Search countries..."
        >
          {(state: any) => (
            <div style="position: relative;">
              <input
                type="text"
                value={state.query()}
                onInput={(e: Event) => state.setQuery((e.target as HTMLInputElement).value)}
                onFocus={() => state.open()}
                onKeyDown={state.onKeyDown}
                placeholder="Start typing a country..."
                style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; outline: none; font-size: 14px;"
              />
              {() => state.isOpen() && state.query().length > 0 ? (
                <div style="position: absolute; top: 100%; left: 0; right: 0; margin-top: 4px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-height: 200px; overflow-y: auto; z-index: 10;">
                  {state.filtered().length > 0
                    ? state.filtered().map((opt: any, i: number) => (
                        <div
                          onClick={() => state.select(opt.value)}
                          style={`padding: 8px 12px; cursor: pointer; font-size: 14px; ${state.highlightedIndex() === i ? 'background: #f3f4f6;' : ''} ${state.isSelected(opt.value) ? 'font-weight: 600; color: #3b82f6;' : ''}`}
                        >
                          {opt.label}
                        </div>
                      ))
                    : <div style="padding: 8px 12px; color: #9ca3af; font-size: 14px;">No countries match your search</div>
                  }
                </div>
              ) : null}
            </div>
          )}
        </Autocomplete>
        <p style="color: #6b7280; font-size: 14px; margin-top: 8px;">
          Selected: {() => {
            const val = selected()
            if (!val) return '(none)'
            const found = countries.find((c) => c.value === val)
            return found ? found.label : val
          }}
        </p>
      </div>

      {/* With pre-selected value */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Default Value</h3>
      <div style="max-width: 300px; margin-bottom: 32px;">
        <Autocomplete
          options={countries}
          defaultValue="cz"
          placeholder="Search countries..."
        >
          {(state: any) => (
            <div style="position: relative;">
              <input
                type="text"
                value={state.query() || state.getLabel(state.selected() as string)}
                onInput={(e: Event) => state.setQuery((e.target as HTMLInputElement).value)}
                onFocus={() => { state.setQuery(''); state.open() }}
                onKeyDown={state.onKeyDown}
                placeholder="Search countries..."
                style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; outline: none; font-size: 14px;"
              />
              {() => state.isOpen() ? (
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
        </Autocomplete>
      </div>

      {/* Disabled */}
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Disabled</h3>
      <div style="max-width: 300px; margin-bottom: 32px;">
        <Autocomplete
          options={countries}
          disabled
          placeholder="Disabled autocomplete"
        >
          {(state: any) => (
            <input
              type="text"
              disabled
              placeholder="Disabled autocomplete"
              style="width: 100%; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 8px; outline: none; font-size: 14px; background: #f9fafb; color: #9ca3af; cursor: not-allowed;"
            />
          )}
        </Autocomplete>
      </div>
    </div>
  )
}
