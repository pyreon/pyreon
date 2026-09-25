/* oxlint-disable jsx-a11y/prefer-tag-over-role -- each enum control is a
   `role="group"` of toggle buttons NAMED by the row's label (aria-labelledby).
   A <fieldset> would need its own <legend> — the label already lives in the
   row header, shared with every other control type — and a fieldset is one of
   the elements Element has to flex-fix. The group role is the lighter, exact
   semantics. */
/**
 * Controls panel (≈ Storybook addon-controls) — one row per inferred control,
 * plus reset. Value-bound inputs: the box always reflects the live value the
 * preview renders, never a write-only placeholder.
 */
import { createUniqueId } from '@pyreon/core'
import type { WorkbenchControl } from '../../catalog'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'
import type { AddonPanelDef } from '../../panels'
import { labelFor, tab } from './shared'

/** One control row (text / number / color / enum / bool). */
function controlRow(m: WorkbenchModel, ctrl: WorkbenchControl) {
  // Every widget is NAMED by its label: `for`/`id` for the single-element
  // widgets (a <label> can label a <button>, so the switch gets it too, and
  // clicking the label toggles it), `aria-labelledby` for the enum GROUP.
  const id = `atlas-ctl-${createUniqueId()}`
  const labelId = `${id}-label`
  return (
    <C.CtrlRow>
      <C.CtrlHead>
        <C.CtrlLabel id={labelId} {...(ctrl.type === 'enum' ? {} : labelFor(id))}>
          {ctrl.label}
        </C.CtrlLabel>
        <C.CtrlType>{ctrl.type}</C.CtrlType>
      </C.CtrlHead>
      {ctrl.type === 'text' ? (
        <C.TextInput
          id={id}
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
      ) : ctrl.type === 'number' ? (
        <C.NumberInput
          id={id}
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
            id={id}
            data-testid={`color-${ctrl.key}`}
            value={() => String(m.vals()[ctrl.key] ?? ctrl.default ?? '#000000')}
            onInput={(e: Event) =>
              m.setValue(m.selId(), ctrl.key, (e.target as HTMLInputElement).value)
            }
          />
          <C.ColorHex>{() => String(m.vals()[ctrl.key] ?? ctrl.default ?? '')}</C.ColorHex>
        </C.ColorRow>
      ) : ctrl.type === 'enum' ? (
        <C.EnumWrap role="group" aria-labelledby={labelId}>
          {(ctrl.options ?? []).map((opt) => (
            <C.EnumBtn
              // A toggle-button group: the pressed one is the current value.
              aria-pressed={() => (m.vals()[ctrl.key] === opt ? 'true' : 'false')}
              state={() => (m.vals()[ctrl.key] === opt ? 'active' : 'idle')}
              onClick={() => m.setValue(m.selId(), ctrl.key, opt)}
            >
              {opt}
            </C.EnumBtn>
          ))}
        </C.EnumWrap>
      ) : (
        <C.Switch
          id={id}
          role="switch"
          // A STRING, not a boolean — a boolean aria-* renders presence-only.
          aria-checked={() => (m.vals()[ctrl.key] ? 'true' : 'false')}
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
