import { signal } from '@pyreon/reactivity'
import { Combobox, MenuItem, Title } from '@pyreon/ui-components'
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
      <Title size="h2" style="margin-bottom: 24px">Combobox</Title>

      <div style="max-width: 300px; margin-bottom: 24px;">
        <Combobox
          options={options}
          value={selected()}
          onChange={(v: string | string[]) => selected.set(v as string)}
          placeholder="Search framework..."
        >
          {(state: ComboboxState) => (
            <div style="position: relative;">
              {/*
                `inputProps()` carries BOTH the primitive's ARIA (role="combobox",
                aria-expanded/-controls/-activedescendant/-autocomplete) AND the
                Combobox component's rocketstyle class — the class rides on `rest`,
                which the primitive merges in here. Without the spread the theme
                reaches no element and the input is unstyled + unannounced.
                Spread FIRST so the demo's own handlers/value win over it.

                `padding` stays inline: Combobox's BASE .theme() has none — padding
                lives only in its `.sizes()` dimension, which needs an explicit
                `size` prop to apply. Everything else here (width, border,
                radius, font-size, outline, focus ring) now comes from the theme.
              */}
              <input
                {...state.inputProps()}
                type="text"
                value={state.query()}
                onInput={(e: Event) => state.setQuery((e.target as HTMLInputElement).value)}
                onFocus={() => state.open()}
                onKeyDown={state.onKeyDown}
                placeholder="Search framework..."
                style="padding: 8px 12px;"
              />
              {() => state.isOpen() ? (
                <div
                  {...state.listboxProps()}
                  style="position: absolute; top: 100%; left: 0; right: 0; margin-top: 4px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-height: 200px; overflow-y: auto; z-index: 10;"
                >
                  {/*
                    `listboxProps()` carries `role="listbox"` AND the id that the
                    input's `aria-controls` points at — without it that reference
                    dangled at a non-existent element. `getOptionProps()` gives each
                    row `role="option"` + `aria-selected`, so the listbox is
                    actually announced. Options are already inside the
                    `{() => state.isOpen() ? …}` accessor, so these snapshot
                    getters re-read on every open/filter (see the Tree lesson).
                  */}
                  {state.filtered().map((opt, i) => (
                    <MenuItem
                      {...state.getOptionProps(opt.value, i)}
                      size="medium"
                      onClick={() => state.select(opt.value)}
                    >
                      {opt.label}
                    </MenuItem>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </Combobox>
        <p style="font-size: 13px; color: #6b7280; margin-top: 8px;">
          Selected: {() => selected() || '(none)'}
        </p>
      </div>
    </div>
  )
}
