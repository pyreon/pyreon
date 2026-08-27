/**
 * Browsable preview components, so the workbench story is actually automated.
 *
 * Atlas discovers exported PascalCase components and their prop types from
 * SOURCE. A generated client has none: it is hooks, schemas and endpoints, so
 * there is nothing for a workbench to show and authored scenarios would point
 * at names that do not exist.
 *
 * These fill that gap with one preview per read operation. Paired with the
 * generated mock routes they render with realistic data and NO server, which is
 * what makes them worth browsing -- a workbench entry that needs a running API
 * is one nobody opens.
 *
 * The variant axis is the DATA STATE, not a response field. A preview's real
 * axes are "loading", "error" and "empty" -- the three a UI gets wrong and the
 * three a live request will not show you on demand. `force` makes each of them
 * reachable, and it is a genuine prop, so Atlas infers a control for it without
 * being told.
 */

import type { IrDocument, IrOperation } from '../core/ir'
import { typeIdent } from '../core/naming'
import { byTag, isMutation, tagFile } from './client'
import { relativeSpecifier, SourceFile } from './writer'

export const COMPONENTS_FILE = 'components.tsx'

/** The states a preview can be pinned to. Shared with the scenario emitter. */
export const FORCED_STATES = ['loading', 'error', 'empty'] as const

/** Preview component name for an operation. */
export function previewName(op: IrOperation): string {
  return `${typeIdent(op.id)}Preview`
}

/**
 * Operations that get a preview: reads, with no path parameter.
 *
 * A path parameter would need a real id to render anything, and inventing one
 * produces a preview that 404s -- worse than no preview, because it looks
 * broken rather than absent.
 */
export function previewOperations(doc: IrDocument): IrOperation[] {
  return [...byTag(doc)].flatMap(([, ops]) =>
    ops.filter(
      (op) =>
        !isMutation(op) &&
        op.pathParams.length === 0 &&
        // A REQUIRED query parameter has the same problem as a path one: any
        // value the generator invents is a guess, and a preview built on a
        // guess renders an error rather than the shape it exists to show.
        !op.queryParams.some((p) => p.required),
    ),
  )
}

/**
 * How the preview calls its hook.
 *
 * A hook for an operation with query parameters takes an args ACCESSOR even
 * when every one of them is optional, so calling it bare does not compile.
 */
function hookCall(op: IrOperation, hook: string): string {
  return op.queryParams.length > 0 ? `${hook}(() => ({}))` : `${hook}()`
}

/** Emit `components.tsx`. */
export function emitComponents(doc: IrDocument): SourceFile {
  const f = new SourceFile(COMPONENTS_FILE)
  const ops = previewOperations(doc)
  if (ops.length === 0) return f

  f.import('@pyreon/core', 'For', 'Show')
  for (const [tag, tagOps] of byTag(doc)) {
    const mine = tagOps.filter((op) => ops.includes(op))
    if (mine.length === 0) continue
    f.import(
      relativeSpecifier(COMPONENTS_FILE, `queries/${tagFile(tag)}.ts`),
      ...mine.map((op) => `use${typeIdent(op.id)}`),
    )
  }

  f.line()
  f.doc(
    'How a preview is pinned to a state it would not otherwise show.',
    '',
    '`loading` and `error` are the two a live request will not produce on',
    'demand, and `empty` is the one a seeded mock hides. They are the three a',
    'UI most often gets wrong, so they are the axis worth browsing.',
  )
  f.line("export type PreviewState = 'loading' | 'error' | 'empty'")

  for (const op of ops) {
    const name = previewName(op)
    const hook = `use${typeIdent(op.id)}`
    const isList = op.response?.kind === 'array'
    f.line()
    f.line(`export interface ${name}Props {`)
    f.line('  /** Pin the preview to a state instead of showing the real request. */')
    f.line('  force?: PreviewState')
    f.line('}')
    f.line()
    f.doc(op.summary, `Preview of \`${op.method} ${op.path}\`.`)
    f.line(`export function ${name}(props: ${name}Props) {`)
    f.line(`  const q = ${hookCall(op, hook)}`)
    // `force` is read inside accessors, so flipping the control re-renders
    // without remounting the component.
    f.line(`  const pending = () => props.force === 'loading' || q.isPending()`)
    f.line(`  const failed = () => props.force === 'error' || q.isError()`)
    if (isList) {
      f.line(`  const rows = () => (props.force === 'empty' ? [] : (q.data() ?? []))`)
    } else {
      f.line(`  const value = () => (props.force === 'empty' ? undefined : q.data())`)
    }
    f.line('  return (')
    f.line(`    <section data-preview=${JSON.stringify(op.id)}>`)
    f.line('      <Show when={() => !pending()} fallback={<p data-state="loading">Loading…</p>}>')
    f.line('        <Show when={() => !failed()} fallback={<p data-state="error">Request failed.</p>}>')
    if (isList) {
      f.line('          <Show when={() => rows().length > 0} fallback={<p data-state="empty">No results.</p>}>')
      f.line('            <ul data-state="data">')
      // `by` takes ONE argument. A preview row has no guaranteed id, so the
      // key is the row's own content -- stable for a static preview, and the
      // alternative (an index) is not something `by` is given.
      f.line('              <For each={rows} by={(row: unknown) => JSON.stringify(row)}>')
      f.line('                {(row: unknown) => <li>{JSON.stringify(row)}</li>}')
      f.line('              </For>')
      f.line('            </ul>')
      f.line('          </Show>')
    } else {
      f.line('          <Show when={() => value() !== undefined} fallback={<p data-state="empty">No result.</p>}>')
      f.line('            <pre data-state="data">{() => JSON.stringify(value(), null, 2)}</pre>')
      f.line('          </Show>')
    }
    f.line('        </Show>')
    f.line('      </Show>')
    f.line('    </section>')
    f.line('  )')
    f.line('}')
  }
  return f
}
