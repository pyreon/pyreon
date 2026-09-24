/**
 * Controls panel (≈ Storybook addon-controls) — one row per inferred control,
 * plus reset. Value-bound inputs: the box always reflects the live value the
 * preview renders, never a write-only placeholder.
 */
import { computed } from '@pyreon/reactivity'
import type { WorkbenchControl } from '../../catalog'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'
import type { AddonPanelDef } from '../../panels'
import { tab } from './shared'

/**
 * Can a text box edit this value without destroying it?
 *
 * A scenario's args are its WHOLE pinned state, so a prop the scan typed as
 * text can hold a render function (Accordion's `children`), a vnode, an array
 * of options or a data object. A text box showed that as the function's SOURCE
 * or `[object Object]`, and the first keystroke replaced it with a string —
 * the component then rendered the typed text instead of its structure.
 */
export function isTextEditable(value: unknown): boolean {
  return (
    value === undefined || value === null || ['string', 'number', 'boolean'].includes(typeof value)
  )
}

/** A one-line, read-only summary of a value a text box cannot edit. */
export function describeLockedValue(value: unknown): string {
  if (typeof value === 'function') return 'ƒ render function'
  if (Array.isArray(value)) return `[${value.length} item${value.length === 1 ? '' : 's'}]`
  if (value && typeof value === 'object') {
    if ('type' in value && 'props' in value) return '<element>'
    let json = ''
    try {
      json = JSON.stringify(value)
    } catch {
      json = '{…}'
    }
    return json.length > 60 ? `${json.slice(0, 60)}…` : json
  }
  return String(value)
}

function textControl(m: WorkbenchModel, ctrl: WorkbenchControl) {
  // Keyed on the value's KIND, not the value: an accessor that re-rendered on
  // every keystroke would remount the input under the cursor and drop focus.
  const editable = computed(() => isTextEditable(m.vals()[ctrl.key]), { equals: (a, b) => a === b })
  return () =>
    editable() ? (
      <C.TextInput
        // VALUE-bound, not placeholder-only. The input used to show the
        // default as a placeholder and never reflect the live value, which
        // made it write-only: type, switch component, come back, and the box
        // is empty while `vals()` still holds what you typed. It also meant
        // the box did not agree with what the preview was rendering.
        value={() => String(m.vals()[ctrl.key] ?? '')}
        placeholder={String(ctrl.default ?? '')}
        onInput={(e: Event) =>
          m.setValue(m.selId(), ctrl.key, (e.target as HTMLInputElement).value)
        }
      />
    ) : (
      <>
        <C.TextInput
          data-testid={`ctrl-locked-${ctrl.key}`}
          readOnly
          aria-readonly="true"
          value={() => describeLockedValue(m.vals()[ctrl.key])}
        />
        <C.A11yNote>
          Set by the scenario — structure, not text. Edit it in atlas.config.ts.
        </C.A11yNote>
      </>
    )
}

/** One control row (text / number / color / enum / bool). */
function controlRow(m: WorkbenchModel, ctrl: WorkbenchControl) {
  return (
    <C.CtrlRow>
      <C.CtrlHead>
        <C.CtrlLabel>{ctrl.label}</C.CtrlLabel>
        <C.CtrlType>{ctrl.type}</C.CtrlType>
      </C.CtrlHead>
      {ctrl.type === 'text' ? (
        textControl(m, ctrl)
      ) : ctrl.type === 'number' ? (
        <C.NumberInput
          value={() => String(m.vals()[ctrl.key] ?? '')}
          placeholder={String(ctrl.default ?? '')}
          onInput={(e: Event) => {
            // Stored as a NUMBER, because the component's prop is one — a
            // string here silently breaks any arithmetic the component does.
            // An empty/unparsable box falls back to the declared default.
            const raw = (e.target as HTMLInputElement).value
            const n = Number(raw)
            m.setValue(m.selId(), ctrl.key, raw === '' || Number.isNaN(n) ? ctrl.default : n)
          }}
        />
      ) : ctrl.type === 'color' ? (
        <C.ColorRow>
          <C.ColorInput
            data-testid={`color-${ctrl.key}`}
            value={() => String(m.vals()[ctrl.key] ?? ctrl.default ?? '#000000')}
            onInput={(e: Event) =>
              m.setValue(m.selId(), ctrl.key, (e.target as HTMLInputElement).value)
            }
          />
          <C.ColorHex>{() => String(m.vals()[ctrl.key] ?? ctrl.default ?? '')}</C.ColorHex>
        </C.ColorRow>
      ) : ctrl.type === 'enum' ? (
        <C.EnumWrap>
          {(ctrl.options ?? []).map((opt) => (
            <C.EnumBtn
              state={() => (m.vals()[ctrl.key] === opt ? 'active' : 'idle')}
              onClick={() => m.setValue(m.selId(), ctrl.key, opt)}
            >
              {opt}
            </C.EnumBtn>
          ))}
        </C.EnumWrap>
      ) : (
        <C.Switch
          state={() => (m.vals()[ctrl.key] ? 'on' : 'off')}
          onClick={() => m.setValue(m.selId(), ctrl.key, !m.vals()[ctrl.key])}
        >
          <C.Knob state={() => (m.vals()[ctrl.key] ? 'on' : 'off')} />
        </C.Switch>
      )}
    </C.CtrlRow>
  )
}

export const controlsPanel: AddonPanelDef = {
  ...tab('controls'),
  render: (model) => {
    const m = model as WorkbenchModel
    return (
      <>
        {() => m.sel()?.controls.map((ctrl) => controlRow(m, ctrl)) ?? null}
        <C.ResetBtn onClick={m.reset}>Reset to defaults</C.ResetBtn>
      </>
    )
  },
}
