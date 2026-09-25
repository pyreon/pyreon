/**
 * Browsable preview components, so the workbench story is actually automated.
 *
 * Atlas discovers exported PascalCase components and their prop types from
 * SOURCE. A generated client has none: it is hooks, schemas and endpoints, so
 * there is nothing for a workbench to show and authored scenarios would point
 * at names that do not exist.
 *
 * These fill that gap with one preview per safe read. Paired with the generated
 * mock routes they render with realistic data and NO server, which is what
 * makes them worth browsing -- a workbench entry that needs a running API is
 * one nobody opens.
 *
 * What a preview shows is decided from the response SHAPE at generation time:
 * a list of objects is a table whose columns are the model's declared fields,
 * one object is a description list, anything else is its value as text. A
 * `<pre>` JSON dump shows that a request worked; it does not show what the
 * data looks like in a UI, which is the only reason to open a workbench.
 *
 * The props are the axes Atlas infers controls from: `force` pins the three
 * states a live request will not show on demand (loading, error, empty),
 * `args` changes the request, and `data` renders a supplied value -- the
 * generated "Data" scenario passes fake data through it.
 */

import { modelIndex } from '../core/graph'
import type { IrDocument, IrField, IrOperation, IrParam, IrType } from '../core/ir'
import { responseKindOf } from '../core/media'
import { typeIdent } from '../core/naming'
import { byTag, tagFile } from './client'
import { jsLiteral, sampleArgs } from './jsdoc'
import { hasInput } from './operation-types'
import { q, relativeSpecifier, SourceFile } from './writer'

export const COMPONENTS_FILE = 'components.tsx'

/** The states a preview can be pinned to. Shared with the scenario emitter. */
export const FORCED_STATES = ['loading', 'error', 'empty'] as const

/** Preview component name for an operation. */
export function previewName(op: IrOperation): string {
  return `${typeIdent(op.id)}Preview`
}

/**
 * Words that mark an operation as handling a CREDENTIAL or a SESSION. A
 * preview calls its operation when the workbench opens, so previewing
 * `loginUser` would send a password on page load and `logoutUser` would end
 * the session -- neither is a read worth browsing, whatever its method says.
 */
const CREDENTIAL_WORDS = new Set([
  'login', 'logout', 'logon', 'logoff', 'signin', 'signout', 'signup',
  'auth', 'authn', 'authz', 'authorize', 'authorization', 'authenticate', 'authentication',
  'oauth', 'oauth2', 'token', 'tokens', 'session', 'sessions',
  'password', 'passwd', 'passphrase', 'secret', 'secrets', 'credential', 'credentials',
  'apikey', 'otp', 'mfa', '2fa',
])

/**
 * Is any WORD of `text` a credential word? Split on case changes and
 * separators, and joined pairwise too, so `loginUser`, `/user/log-in`,
 * `api_key` and `signIn` all match -- but `author` and `tokenizer` do not.
 */
function mentionsCredential(text: string): boolean {
  const parts = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  return parts.some((w, i) => CREDENTIAL_WORDS.has(w) || CREDENTIAL_WORDS.has(w + (parts[i + 1] ?? '')))
}

/** Does the operation carry or manage a credential — by its name, path or inputs? */
export function isCredentialOperation(op: IrOperation): boolean {
  const params: readonly IrParam[] = [...op.pathParams, ...op.queryParams, ...op.headerParams, ...op.cookieParams]
  return [op.id, op.path, ...params.map((p) => p.name)].some((t) => mentionsCredential(t))
}

/**
 * Operations that get a preview: safe READS with something to show.
 *
 * - `GET` only. `HEAD`/`OPTIONS` return nothing to render, and every other
 *   method changes server state -- a workbench that opens with a `DELETE`
 *   is one nobody opens twice.
 * - A typed JSON response. A read with no body (`logoutUser`) or a binary one
 *   renders "No result" and nothing else.
 * - Not a credential or session operation (see {@link isCredentialOperation}).
 *
 * Path and required query parameters are no longer a reason to skip: the
 * preview requests with the spec's example values (or a deterministic sample),
 * and the generated mock routes answer any value, so `getPetById` renders a
 * pet instead of being absent.
 */
export function previewOperations(doc: IrDocument): IrOperation[] {
  return [...byTag(doc)].flatMap(([, ops]) =>
    ops.filter(
      (op) =>
        op.method === 'GET' &&
        op.response !== undefined &&
        responseKindOf(op) === 'json' &&
        !isCredentialOperation(op),
    ),
  )
}

/** How a response is rendered, decided from its declared type. */
type Shape =
  | { kind: 'table'; columns: readonly string[] }
  | { kind: 'record'; fields: readonly string[] | undefined }
  | { kind: 'text' }

/** At most this many table columns: a wider table is unreadable in a card. */
const MAX_COLUMNS = 6

function resolve(type: IrType, doc: IrDocument): IrType {
  let t = type
  for (let i = 0; i < 8; i++) {
    if (t.kind === 'nullable') t = t.inner
    else if (t.kind === 'ref') {
      const model = modelIndex(doc).get(t.name)
      if (!model) return t
      t = model.type
    } else break
  }
  return t
}

/**
 * The fields a preview displays: not a password, token or secret — a workbench
 * card is exactly the kind of screen that gets screenshotted and shared.
 */
function shown(fields: readonly IrField[]): string[] {
  return fields.filter((f) => !f.writeOnly && !mentionsCredential(f.name)).map((f) => f.name)
}

/** Pick the renderer for a response type. */
export function responseShape(type: IrType, doc: IrDocument): Shape {
  const t = resolve(type, doc)
  if (t.kind === 'array') {
    const item = resolve(t.items, doc)
    // A nullable item could be `null` in a row; the table would need a guard
    // per cell, and the generic text rendering handles it already.
    if (item.kind === 'object' && item.fields.length > 0 && t.items.kind !== 'nullable') {
      return { kind: 'table', columns: shown(item.fields).slice(0, MAX_COLUMNS) }
    }
    return { kind: 'text' }
  }
  if (t.kind === 'object') {
    // A map (`additionalProperties` only) has no declared keys; its entries
    // are listed as they arrive.
    return { kind: 'record', fields: t.fields.length > 0 ? shown(t.fields) : undefined }
  }
  return { kind: 'text' }
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
    // `typeof getPetById` in a TYPE position needs only a type import.
    f.importType(relativeSpecifier(COMPONENTS_FILE, `endpoints/${tagFile(tag)}.ts`), ...mine.map((op) => op.id))
  }

  f.line()
  f.doc('A state a preview can be pinned to — the three a live request will not show on demand.')
  f.line("export type PreviewState = 'loading' | 'error' | 'empty'")
  emitRenderers(f)

  for (const op of ops) emitPreview(f, op, doc)
  return f
}

/** The shared, shape-specific renderers every preview uses. */
function emitRenderers(f: SourceFile): void {
  f.line()
  f.doc('One value as display text: scalars as-is, a list joined, an object by its name or id.')
  f.line('function show(value: unknown): string {')
  f.line("  if (value === null || value === undefined) return '—'")
  f.line('  if (Array.isArray(value)) {')
  f.line("    if (value.length === 0) return '—'")
  f.line("    return value.every((v) => v === null || typeof v !== 'object') ? value.join(', ') : `${value.length} items`")
  f.line('  }')
  f.line("  if (typeof value === 'object') {")
  f.line('    const o = value as Record<string, unknown>')
  f.line('    const label = o.name ?? o.title ?? o.label ?? o.id')
  f.line("    return label !== undefined && typeof label !== 'object' ? String(label) : JSON.stringify(value)")
  f.line('  }')
  f.line('  return String(value)')
  f.line('}')
  f.line()
  f.line('function field(value: unknown, key: string): unknown {')
  f.line("  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined")
  f.line('}')
  f.line()
  f.doc('A list of records as a table, one column per declared field.')
  f.line('function PreviewTable(props: { rows: () => unknown[]; columns: string[] }) {')
  f.line('  return (')
  f.line('    <table data-state="data">')
  f.line('      <thead>')
  f.line('        <tr>')
  f.line('          <For each={props.columns} by={(c: string) => c}>')
  f.line('            {(c: string) => <th scope="col">{c}</th>}')
  f.line('          </For>')
  f.line('        </tr>')
  f.line('      </thead>')
  f.line('      <tbody>')
  // A row has no guaranteed id, and two rows can be identical (a fixture
  // built from the spec's examples often is), so the key is position PLUS
  // content: unique, and a changed row re-renders.
  f.line('        <For each={() => props.rows().map((row, i) => ({ row, key: `${i}:${JSON.stringify(row)}` }))} by={(r: { key: string }) => r.key}>')
  f.line('          {({ row }: { row: unknown }) => (')
  f.line('            <tr>')
  f.line('              <For each={props.columns} by={(c: string) => c}>')
  f.line('                {(c: string) => <td>{show(field(row, c))}</td>}')
  f.line('              </For>')
  f.line('            </tr>')
  f.line('          )}')
  f.line('        </For>')
  f.line('      </tbody>')
  f.line('    </table>')
  f.line('  )')
  f.line('}')
  f.line()
  f.doc('One record as a description list — its declared fields, or every key of a map.')
  f.line('function PreviewRecord(props: { value: () => unknown; fields?: string[] | undefined }) {')
  f.line('  const keys = (): string[] => {')
  f.line('    const v = props.value()')
  f.line("    return props.fields ?? (typeof v === 'object' && v !== null ? Object.keys(v) : [])")
  f.line('  }')
  f.line('  return (')
  f.line('    <dl data-state="data">')
  f.line('      <For each={keys} by={(k: string) => k}>')
  f.line('        {(k: string) => (')
  f.line('          <div>')
  f.line('            <dt>{k}</dt>')
  f.line('            <dd>{() => show(field(props.value(), k))}</dd>')
  f.line('          </div>')
  f.line('        )}')
  f.line('      </For>')
  f.line('    </dl>')
  f.line('  )')
  f.line('}')
}

function emitPreview(f: SourceFile, op: IrOperation, doc: IrDocument): void {
  const name = previewName(op)
  const hook = `use${typeIdent(op.id)}`
  const input = `Parameters<typeof ${op.id}>[0]`
  const data = `Awaited<ReturnType<typeof ${op.id}>>`
  const shape = responseShape(op.response as IrType, doc)
  const args = hasInput(op) ? sampleArgs(op, doc) : undefined

  f.line()
  f.line(`export interface ${name}Props {`)
  if (hasInput(op)) {
    f.line("  /** The request's arguments. Defaults to the spec's example values. */")
    f.line(`  args?: ${input} | undefined`)
  }
  f.line('  /** Show this value instead of requesting it. */')
  f.line(`  data?: ${data} | undefined`)
  f.line('  /** Pin the preview to a state instead of showing the real request. */')
  f.line('  force?: PreviewState | undefined')
  f.line('}')
  if (hasInput(op)) {
    f.line()
    const decl = `const ${op.id}$args: ${input} = `
    f.line(`${decl}${jsLiteral(args ?? {}, 0, decl.length)}`)
  }
  f.line()
  f.doc(op.summary, '', `Preview of \`${op.method} ${op.path}\`.`)
  f.line(`export function ${name}(props: ${name}Props) {`)
  // A supplied `data` DISABLES the request: returning `undefined` from the
  // args accessor is the hook's "not yet", and `enabled: false` is the same
  // for a hook that takes no arguments.
  f.line(
    hasInput(op)
      ? `  const q = ${hook}(() => (props.data === undefined ? (props.args ?? ${op.id}$args) : undefined))`
      : `  const q = ${hook}(() => ({ enabled: props.data === undefined }))`,
  )
  // `force` and `data` are read inside accessors, so flipping a control
  // re-renders without remounting the component.
  f.line('  const live = () => props.data === undefined')
  f.line(`  const pending = () => props.force === 'loading' || (live() && q.isPending())`)
  f.line(`  const failed = () => props.force === 'error' || (live() && q.isError())`)
  f.line(`  const value = () => (props.force === 'empty' ? undefined : (props.data ?? q.data()))`)
  const empty =
    shape.kind === 'table'
      ? '() => { const v = value(); return Array.isArray(v) && v.length > 0 }'
      : '() => value() !== undefined && value() !== null'
  f.line('  return (')
  f.line(`    <section data-preview=${JSON.stringify(op.id)}>`)
  f.line('      <Show when={() => !pending()} fallback={<p data-state="loading">Loading…</p>}>')
  f.line('        <Show when={() => !failed()} fallback={<p data-state="error">Request failed.</p>}>')
  f.line(`          <Show when={${empty}} fallback={<p data-state="empty">No results.</p>}>`)
  if (shape.kind === 'table') {
    f.line(
      `            <PreviewTable rows={() => { const v = value(); return Array.isArray(v) ? v : [] }} columns={${listLiteral(shape.columns)}} />`,
    )
  } else if (shape.kind === 'record') {
    f.line(
      `            <PreviewRecord value={value}${shape.fields ? ` fields={${listLiteral(shape.fields)}}` : ''} />`,
    )
  } else {
    f.line('            <p data-state="data">{() => show(value())}</p>')
  }
  f.line('          </Show>')
  f.line('        </Show>')
  f.line('      </Show>')
  f.line('    </section>')
  f.line('  )')
  f.line('}')
}

/** A one-line string-array literal — column and field lists stay on their line. */
function listLiteral(items: readonly string[]): string {
  return `[${items.map((i) => q(i)).join(', ')}]`
}
