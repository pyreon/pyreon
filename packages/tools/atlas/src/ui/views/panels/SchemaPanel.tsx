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
 *
 * The table says where EVERY control came from — the schema, a rocketstyle
 * dimension, the prop type, the content seed, or the hand-written catalog —
 * and marks a control `atlas dev` saw appear on a rescan ("added 2 min ago"),
 * so a prop just typed into the source is visibly picked up.
 */
import { onUnmount, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { extractFields } from '@pyreon/feature'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'
import type { AddonPanelRender } from '../../panels'
import { addedAgo, NEW_FOR_MS, schemaRows, validateValues } from '../../schema-controls'

/** The panel body — loaded on first open (see ./lazy). */
export const render: AddonPanelRender = (model) => {
  const m = model as WorkbenchModel
  const schema = () => m.sel()?.schema
  // Read once per schema: introspection walks the schema's shape.
  const fields = () => {
    const s = schema()
    return s === undefined ? [] : extractFields(s)
  }
  const rows = () => schemaRows(m.sel()?.controls ?? [], fields())
  const verdict = () => (schema() ? validateValues(schema(), m.vals()) : null)
  // "added N min ago" ages while the panel is open. One timer per mounted
  // panel, cleared with it.
  const now = signal(Date.now())
  const tick = setInterval(() => now.set(Date.now()), 30_000)
  onUnmount(() => clearInterval(tick))

  return (
    <>
      <C.Callout state="acc" data-testid="schema-lead">
        {() => {
          const c = m.sel()
          if (!c) return 'No component selected.'
          if (schema() === undefined) {
            return `${c.name} declares no schema, so its controls come from the declarations below. Add \`schema\` to its catalog entry to validate the live values against it.`
          }
          if (fields().length === 0) {
            // The introspection limit, stated rather than hidden: shape-
            // reading is not part of the Standard Schema spec, so a
            // non-Zod schema still VALIDATES but lists no fields.
            return `${c.name}'s schema validates the live values below, but its fields could not be read — control generation is Zod-only, because shape introspection is not part of the Standard Schema contract.`
          }
          return `${c.name}'s controls come from its schema. Add a field to the schema and its control appears here.`
        }}
      </C.Callout>

      <Show when={() => rows().length === 0}>
        <C.ActionsEmpty data-testid="schema-empty">
          This component exposes no editable props — nothing to derive a control from.
        </C.ActionsEmpty>
      </Show>

      <Show when={() => rows().length > 0}>
        <C.DataTable data-testid="schema-table">
          <table>
            <thead>
              <tr>
                <th scope="col">field</th>
                <th scope="col">type</th>
                <th scope="col">control</th>
                <th scope="col">source</th>
              </tr>
            </thead>
            <tbody>
              {() =>
                rows().map((row) => {
                  const fresh = row.addedAt !== undefined && now() - row.addedAt < NEW_FOR_MS
                  return (
                    <tr data-testid="schema-field" data-source={row.source} data-new={fresh ? '' : undefined}>
                      <td data-v="key">
                        {row.key}
                        {fresh ? <C.Chip state="acc">new</C.Chip> : null}
                      </td>
                      <td>{row.type}</td>
                      <td>{row.control}</td>
                      <td data-v="dim" data-testid="schema-source">
                        {row.addedAt !== undefined ? `${row.source} · ${addedAgo(row.addedAt, now())}` : row.source}
                      </td>
                    </tr>
                  )
                })
              }
            </tbody>
          </table>
        </C.DataTable>
      </Show>

      <Show when={() => schema() !== undefined}>
        <>
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
}
