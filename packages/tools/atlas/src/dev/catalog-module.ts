/**
 * Generate the virtual catalog module `atlas dev` serves to the browser.
 *
 * This is the thesis made executable. Storybook's catalog is AUTHORED — every
 * component needs a `.stories.tsx` written and maintained by hand, and the
 * moment it drifts from the component nobody finds out. Atlas DERIVES it: the
 * components are discovered from source, their props read from their types,
 * and this module is the bridge that turns that into something the workbench
 * can render.
 *
 * Kept pure — string in, string out — so the generator is unit-testable without
 * booting a server, which is where the interesting failure modes are (a
 * component whose name collides, a path that needs escaping, a project with
 * nothing in it).
 */
import type { ComponentIntelligence, PropControl } from '../core'

/** A component paired with the absolute path it is imported from. */
export interface CatalogEntrySource {
  component: ComponentIntelligence
  /** Absolute path, as the browser's import specifier. */
  file: string
}

/** JS string literal, safe for a Windows path or a name containing a quote. */
function lit(value: string): string {
  return JSON.stringify(value)
}

/**
 * A stable id from the component name.
 *
 * Ids reach the URL and the DOM (`data-testid`), so they are slugified rather
 * than passed through. Collisions are resolved by suffix rather than by last-
 * one-wins: two components legitimately share a name across directories, and
 * silently dropping one is the failure mode this whole tool exists to avoid.
 */
export function slugify(name: string): string {
  return (
    name
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'component'
  )
}

export function uniqueIds(names: readonly string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const base = slugify(name)
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n === 0 ? base : `${base}-${n + 1}`
  })
}

/**
 * The group a component is filed under — its directory relative to the scan
 * root, title-cased. A flat list is unusable past ~30 components, and the
 * directory is the grouping the author already chose.
 */
export function groupFor(file: string, root: string): string {
  const rel = file.startsWith(root) ? file.slice(root.length) : file
  const parts = rel.split('/').filter(Boolean)
  parts.pop() // drop the filename
  if (parts.length === 0) return 'Components'
  const dir = parts[parts.length - 1]!
  return dir.charAt(0).toUpperCase() + dir.slice(1)
}

/** Map a discovered control to the workbench's control shape. */
export function toWorkbenchControl(control: PropControl): {
  key: string
  label: string
  type: 'text' | 'enum' | 'bool'
  options?: readonly string[]
  default: unknown
} {
  const label = control.name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())

  if (control.kind === 'boolean') {
    return { key: control.name, label, type: 'bool', default: control.defaultValue ?? false }
  }
  if (control.kind === 'select' && control.options && control.options.length > 0) {
    return {
      key: control.name,
      label,
      type: 'enum',
      options: control.options,
      default: control.defaultValue ?? control.options[0],
    }
  }
  // Everything else edits as text.
  return { key: control.name, label, type: 'text', default: control.defaultValue ?? '' }
}

/**
 * Is this prop editable as a control at all?
 *
 * A `reactive` prop is a function the component CALLS — an accessor or an event
 * handler. Emitting it as a text control means the component is handed `''`,
 * and the runtime then warns `Event handler "onClick" received a non-function
 * value (string)` on every render. Observed for real: the derived catalog did
 * exactly that to every `onClick` it found.
 *
 * They are omitted from the controls rather than shown-and-disabled, because a
 * control that cannot be used is noise in a list whose whole job is "these are
 * the knobs". The props themselves are NOT lost — they stay in the component's
 * `ComponentIntelligence`, so the catalog JSON and the agent guide still report
 * them, which is where a reader looks for the full signature.
 */
export function isEditableControl(control: PropControl): boolean {
  return control.kind !== 'reactive'
}

export interface GenerateOptions {
  /** Absolute path of the scanned root, used to derive groups. */
  root: string
}

/**
 * Emit the virtual module's source.
 *
 * Every component is imported by NAME from its file. A component that cannot be
 * imported (renamed, deleted between scan and serve) would throw at module
 * evaluation and take the whole workbench down with it, so each entry's render
 * is guarded and reports the failure IN the preview rather than blanking the
 * app — an empty canvas reads as "this component renders nothing", which is a
 * different and much more confusing bug than "this component failed to load".
 */
export function generateCatalogModule(
  entries: readonly CatalogEntrySource[],
  options: GenerateOptions,
): string {
  if (entries.length === 0) {
    // A project with no components is a real state (wrong `--dir`, a fresh
    // repo). It must produce a VALID module with an empty catalog, so the
    // workbench boots and can say so — not a syntax error at import time.
    return [
      "import { h } from '@pyreon/core'",
      'void h',
      'export const catalog = { components: [] }',
      '',
    ].join('\n')
  }

  const ids = uniqueIds(entries.map((e) => e.component.name))
  const lines: string[] = ["import { h } from '@pyreon/core'", '']

  entries.forEach((entry, i) => {
    lines.push(`import * as __mod${i} from ${lit(entry.file)}`)
  })
  lines.push('')

  lines.push('export const catalog = {')
  lines.push('  components: [')

  entries.forEach((entry, i) => {
    const { component } = entry
    const controls = component.controls.filter(isEditableControl).map(toWorkbenchControl)
    lines.push('    {')
    lines.push(`      id: ${lit(ids[i]!)},`)
    lines.push(`      name: ${lit(component.name)},`)
    lines.push(`      group: ${lit(groupFor(entry.file, options.root))},`)
    // No `status`: nothing in a derived catalog measures maturity, and a
    // hardcoded 'stable' pill on every component is decorative fiction — the
    // docs view simply omits the pill when the field is absent.
    if (component.summary) lines.push(`      desc: ${lit(component.summary)},`)
    lines.push(`      controls: ${JSON.stringify(controls)},`)
    // The guard is the point: one broken export must not blank the workbench.
    lines.push(`      render: (props) => {`)
    lines.push(`        const Comp = __mod${i}[${lit(component.name)}] ?? __mod${i}.default`)
    lines.push(`        if (typeof Comp !== 'function') {`)
    lines.push(
      `          return h('div', { 'data-atlas-error': ${lit(component.name)} }, ` +
        `${lit(`Could not load ${component.name} from `)} + ${lit(entry.file)})`,
    )
    lines.push(`        }`)
    lines.push(`        return h(Comp, props)`)
    lines.push(`      },`)
    lines.push('    },')
  })

  lines.push('  ],')
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}
