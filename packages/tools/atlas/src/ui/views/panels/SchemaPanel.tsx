/**
 * The Schema panel — controls derived from the scenario's schema, and a live
 * verdict on the current values.
 *
 * A component that already validates its input has declared its prop shape
 * once. Re-typing that as a control list is boilerplate that can only drift:
 * add a field to the schema and the workbench keeps offering the old set,
 * silently. Deriving it removes that failure mode, and validating the live
 * values against the same schema shows what the component will actually reject
 * instead of letting you drive it into a state the schema forbids.
 */
import { Show } from '@pyreon/core'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'
import { registerAddonPanel } from '../../panels'
import { canIntrospect, controlsFromSchema, validateValues } from '../../schema-controls'

export function registerSchemaPanel(): void {
  registerAddonPanel({
    id: 'schema',
    title: 'Schema',
    hint: 'Controls derived from the schema, and a live validation verdict',
    render: (model) => {
      const m = model as WorkbenchModel
      const schema = () => m.sel()?.schema
      const verdict = () => (schema() ? validateValues(schema(), m.vals()) : null)

      return (
        <>
          <Show when={() => schema() === undefined}>
            <C.ActionsEmpty data-testid="schema-none">
              This scenario declares no schema. Add `schema` to its catalog entry
              to derive controls from it and validate the live values.
            </C.ActionsEmpty>
          </Show>

          <Show when={() => schema() !== undefined}>
            <>
              {/*
                The introspection limit, stated rather than hidden. Shape-reading
                is not part of the Standard Schema spec, so a non-Zod schema
                still VALIDATES but cannot generate controls — and reporting
                that as "no fields" would be a lie.
              */}
              <Show when={() => !canIntrospect(schema())}>
                <C.ActionsEmpty data-testid="schema-no-introspect">
                  Fields could not be read from this schema — control generation
                  is Zod-only, because shape introspection is not part of the
                  Standard Schema contract. Validation below still works.
                </C.ActionsEmpty>
              </Show>

              <Show when={() => canIntrospect(schema())}>
                <>
                  <C.CtrlRow>
                    <C.CtrlHead>
                      <C.CtrlLabel>Derived controls</C.CtrlLabel>
                      <C.CtrlType>{() => `${controlsFromSchema(schema()).length} field(s)`}</C.CtrlType>
                    </C.CtrlHead>
                  </C.CtrlRow>
                  {() =>
                    controlsFromSchema(schema()).map((ctrl) => (
                      <C.A11yRow data-testid="schema-field">
                        <C.A11yIcon state="ok">{ctrl.type === 'bool' ? '◉' : ctrl.type === 'enum' ? '≡' : 'T'}</C.A11yIcon>
                        <C.A11yBody>
                          <C.A11yTitle>{ctrl.label}</C.A11yTitle>
                          <C.A11yNote>
                            {ctrl.options ? `${ctrl.type} — ${ctrl.options.join(' | ')}` : ctrl.type}
                          </C.A11yNote>
                        </C.A11yBody>
                      </C.A11yRow>
                    ))
                  }
                </>
              </Show>

              <C.A11ySummary data-testid="schema-verdict">
                <C.A11yStat>
                  <C.A11yDot
                    state={() => {
                      const v = verdict()
                      if (!v) return 'unknown'
                      return v.state === 'valid' ? 'ok' : v.state === 'invalid' ? 'danger' : 'warn'
                    }}
                  />
                  {() => {
                    const v = verdict()
                    if (!v) return 'no verdict'
                    if (v.state === 'valid') return 'values are valid'
                    if (v.state === 'invalid') return `${v.issues.length} issue(s)`
                    if (v.state === 'async') return 'schema validates asynchronously — not checked'
                    return 'not a Standard Schema — cannot validate'
                  }}
                </C.A11yStat>
              </C.A11ySummary>

              {() => {
                const v = verdict()
                if (!v || v.state !== 'invalid') return null
                return v.issues.map((issue) => (
                  <C.A11yRow data-testid="schema-issue">
                    <C.A11yIcon state="danger">×</C.A11yIcon>
                    <C.A11yBody>
                      <C.A11yTitle>{issue.path || '(whole object)'}</C.A11yTitle>
                      <C.A11yNote>{issue.message}</C.A11yNote>
                    </C.A11yBody>
                  </C.A11yRow>
                ))
              }}
            </>
          </Show>
        </>
      )
    },
  })
}
