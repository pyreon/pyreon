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
import { componentKey, type ComponentIntelligence, type PropControl } from '../core'

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
  // The FULL directory chain, `/`-joined and title-cased per segment — the
  // sidebar renders it as a nested tree (`Components/Forms`), which is the
  // grouping the author already chose by making the directory. A single flat
  // level was unusable past ~30 components.
  return parts.map((dir) => dir.charAt(0).toUpperCase() + dir.slice(1)).join('/')
}

/** Map a discovered control to the workbench's control shape. */
export function toWorkbenchControl(control: PropControl): {
  key: string
  label: string
  type: 'text' | 'enum' | 'bool' | 'number' | 'color'
  options?: readonly string[]
  default: unknown
  /**
   * Threaded to the docs table. Which props are REQUIRED, and what an enum
   * ACCEPTS, are the two facts that decide whether a usage is correct — and
   * they are exactly what `atlas check` validates against. A props table
   * without them documents the shape but not the contract.
   */
  required?: boolean
} {
  const label = control.name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())

  if (control.kind === 'boolean') {
    return { key: control.name, label, type: 'bool', default: control.defaultValue ?? false, ...(control.required ? { required: true } : {}) }
  }
  if (control.kind === 'select' && control.options && control.options.length > 0) {
    return {
      key: control.name,
      label,
      type: 'enum',
      options: control.options,
      default: control.defaultValue ?? control.options[0],
      ...(control.required ? { required: true } : {}),
    }
  }
  if (control.kind === 'number') {
    return { key: control.name, label, type: 'number', default: control.defaultValue ?? 0, ...(control.required ? { required: true } : {}) }
  }
  if (control.kind === 'color') {
    return { key: control.name, label, type: 'color', default: control.defaultValue ?? '#3b82f6', ...(control.required ? { required: true } : {}) }
  }
  // Everything else edits as text.
  return { key: control.name, label, type: 'text', default: control.defaultValue ?? '', ...(control.required ? { required: true } : {}) }
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
  /**
   * Absolute path of the project's `atlas.config.*`, when it exports a
   * `wrapper`. The generated module imports the config IN THE BROWSER (so the
   * wrapper compiles through the project's own plugin chain) and wraps every
   * render with it — the same providers contract `atlas scan`'s mount check
   * honors, honored on the canvas.
   */
  configPath?: string
  /** Addon presets — serialized VERBATIM onto the catalog (plain JSON data). */
  presets?: import('../ui/catalog').WorkbenchPresets
  /**
   * Per-component presentation overrides from `atlas.config.ts`.
   *
   * Presentation ONLY — see `PageMeta`. `name` is deliberately NOT overridable:
   * it is the component's real, importable identifier, and the machine surface
   * an agent reads must never carry a display string in its place. A `title`
   * changes the label; `name` stays true.
   */
  pages?: Record<string, import('../discover/config').PageMeta>
  /**
   * Monorepo roots, with ABSOLUTE directories — set only for a multi-root scan.
   *
   * Needed because each project has its OWN root, so a group cannot be derived
   * from one shared scan root: `packages/core/src/forms/Button.tsx` should read
   * `Core/Forms`, not `Packages/Core/Src/Forms`.
   */
  projects?: readonly { name: string; dir: string }[]
}

/**
 * The presentation override for one component.
 *
 * Keyed by identity FIRST, then by bare name. A single-package config writes
 * `{ Button: {...} }` and always has; a monorepo needs `{ 'Core/Button': {...} }`
 * to say WHICH Button — and without the key pass, one entry would silently
 * retitle every package's `Button`.
 */
export function pageFor(
  component: ComponentIntelligence,
  pages: GenerateOptions['pages'],
): import('../discover/config').PageMeta | undefined {
  if (!pages) return undefined
  return pages[componentKey(component)] ?? pages[component.name]
}

/**
 * The group an entry is filed under, before any sorting.
 *
 * In a monorepo the PROJECT leads (`Core/Forms`), because in a combined site
 * "which package is this from" is the first distinction a reader needs — and it
 * is the one the file path alone cannot express once each package has its own
 * root.
 */
function resolvedGroup(entry: CatalogEntrySource, options: GenerateOptions): string {
  const override = pageFor(entry.component, options.pages)?.group
  if (override) return override

  const project = entry.component.project
  if (!project) return groupFor(entry.file, options.root)

  const root = options.projects?.find((p) => p.name === project)
  const within = groupFor(entry.file, root?.dir ?? options.root)
  // `groupFor` answers 'Components' for a file sitting directly in a root.
  // Appending it would file every top-level component under `Core/Components`,
  // a directory that does not exist.
  return within === 'Components' ? project : `${project}/${within}`
}

/**
 * Order the catalog. The sidebar renders it verbatim (`groupComponents`
 * preserves catalog order), so this IS the sidebar's ordering.
 *
 * Sorted by group-first-appearance, then `pages.order`, then discovery order.
 * The first key is what keeps a configured order from scrambling the tree: a
 * plain global sort by `order` would pull a pinned component out of its group
 * and file it wherever the sort landed. The last key is what makes this a
 * no-op for a project that configures nothing — today's behaviour, unchanged,
 * rather than a silent reshuffle on upgrade.
 */
export function sortEntries(
  entries: readonly CatalogEntrySource[],
  options: GenerateOptions,
): CatalogEntrySource[] {
  const groupRank = new Map<string, number>()
  for (const entry of entries) {
    const group = resolvedGroup(entry, options)
    if (!groupRank.has(group)) groupRank.set(group, groupRank.size)
  }
  // Unordered components sort AFTER every ordered one, so pinning three
  // favourites to the top of a group leaves the rest exactly as they were.
  const orderOf = (entry: CatalogEntrySource): number => {
    const order = pageFor(entry.component, options.pages)?.order
    return typeof order === 'number' && Number.isFinite(order) ? order : Number.POSITIVE_INFINITY
  }
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const ga = groupRank.get(resolvedGroup(a.entry, options)) ?? 0
      const gb = groupRank.get(resolvedGroup(b.entry, options)) ?? 0
      if (ga !== gb) return ga - gb
      const oa = orderOf(a.entry)
      const ob = orderOf(b.entry)
      if (oa !== ob) return oa - ob
      return a.index - b.index
    })
    .map((e) => e.entry)
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

  const ordered = sortEntries(entries, options)
  // Ids from the identity KEY, not the name. Two packages' `Button`s would
  // otherwise slugify to `button` and `button-2` — unique, but arbitrary: which
  // one got the suffix depends on discovery order, so a URL or a `data-testid`
  // could point at the other package's component after an unrelated file was
  // added. From the key they are `core-button` and `admin-button`: stable, and
  // readable. Outside a monorepo the key IS the name, so nothing changes.
  const ids = uniqueIds(ordered.map((e) => componentKey(e.component)))
  const lines: string[] = ["import { h } from '@pyreon/core'", '']

  ordered.forEach((entry, i) => {
    lines.push(`import * as __mod${i} from ${lit(entry.file)}`)
  })
  if (options.configPath) {
    lines.push(`import * as __config from ${lit(options.configPath)}`)
    // The recording permissions provider goes INNERMOST when a wrapper exists:
    // a project wrapper commonly carries its own `PermissionsProvider` (the
    // scan needs one), and context resolution is nearest-wins — without this,
    // the wrapper's static provider would shadow the workbench's RECORDING
    // instance and the Roles panel would silently audit nothing.
    lines.push(`import { PermissionsProvider as __Perms } from '@pyreon/permissions'`)
  }
  lines.push('')

  if (options.configPath) {
    // Mirrors `loadAtlasConfig`'s resolution exactly: a named export wins over
    // `default.*`, and a non-function is ignored rather than mounted (the Node
    // side already surfaced that as a config error).
    //
    // `__section` handles BOTH config files: `atlas.config.ts` exports the
    // fields directly, `pyreon.config.ts` nests them under `atlas`. Resolving
    // it once here means everything below reads identically for either.
    lines.push('const __default = __config.default ?? {}')
    lines.push('const __section = __config.atlas ?? __default.atlas ?? __default')
    lines.push('const __wrapper =')
    lines.push('  typeof __config.wrapper === "function" ? __config.wrapper')
    lines.push('  : typeof __section.wrapper === "function" ? __section.wrapper')
    lines.push('  : undefined')
    // Render EXTENSIONS, composed OUTSIDE-IN in declaration order, with the
    // `wrapper` shorthand innermost. Filtered to entries that actually carry a
    // `wrap`: a setup-only extension is legitimate and must not become an
    // `h(undefined, …)`, which renders a literal `<undefined>` element.
    lines.push('const __extensions = [')
    lines.push('  ...(Array.isArray(__config.extensions) ? __config.extensions')
    lines.push('    : Array.isArray(__section.extensions) ? __section.extensions : []),')
    lines.push('  ...(__wrapper ? [{ name: "wrapper", wrap: __wrapper }] : []),')
    lines.push(']')
    lines.push('const __layers = __extensions.filter((e) => typeof e?.wrap === "function")')
    lines.push('')
    // One-time setup — fonts, a global stylesheet, anything document-level a
    // wrapper cannot reach because it renders INSIDE the preview.
    //
    // Each is isolated: an extension that throws during setup must not stop the
    // others, and must not take the whole workbench down before anything
    // renders. It is reported, named, and the rest continue.
    lines.push('for (const __ext of __extensions) {')
    lines.push('  if (typeof __ext?.setup !== "function") continue')
    lines.push('  try { __ext.setup() } catch (err) {')
    lines.push(
      '    console.error("[Pyreon] atlas: extension \\"" + __ext.name + "\\" failed during setup:", err)',
    )
    lines.push('  }')
    lines.push('}')
    lines.push('')
    // `reduceRight` so the FIRST listed extension ends up outermost — the order
    // the equivalent JSX would be written by hand, which is the only ordering a
    // reader can predict without consulting docs.
    lines.push('const __wrapAll = (__el) =>')
    lines.push('  __layers.reduceRight((__acc, __ext) => h(__ext.wrap, {}, __acc), __el)')
    lines.push('')
  }

  lines.push('export const catalog = {')
  if (options.presets) lines.push(`  presets: ${JSON.stringify(options.presets)},`)
  lines.push('  components: [')

  ordered.forEach((entry, i) => {
    const { component } = entry
    const controls = component.controls.filter(isEditableControl).map(toWorkbenchControl)
    // The discovered event surface. These are the props the Actions panel can
    // observe — the controls list deliberately excludes them (a function is not
    // an editable value), so they are threaded separately.
    const reactiveProps = component.controls.filter((c) => c.reactive).map((c) => c.name)
    const page = pageFor(component, options.pages)
    lines.push('    {')
    lines.push(`      id: ${lit(ids[i]!)},`)
    // The REAL name, always. It is what the usage snippet writes, what the
    // `source`/`lens` RPC looks up, and what an agent imports. A configured
    // `title` is a separate DISPLAY field precisely so overriding the label can
    // never desynchronise any of those.
    lines.push(`      name: ${lit(component.name)},`)
    // The identity key. Emitted only when it differs from the name (i.e. in a
    // monorepo), so a single-package catalog is byte-identical to before. Every
    // node-answered lookup (`source`, `lens`) sends THIS, not the name —
    // otherwise two packages' `Button`s would ask the same question and one
    // would be shown the other's source.
    const key = componentKey(component)
    if (key !== component.name) lines.push(`      key: ${lit(key)},`)
    if (page?.title) lines.push(`      title: ${lit(page.title)},`)
    lines.push(`      group: ${lit(resolvedGroup(entry, options))},`)
    // No `status`: nothing in a derived catalog measures maturity, and a
    // hardcoded 'stable' pill on every component is decorative fiction — the
    // docs view simply omits the pill when the field is absent.
    const desc = page?.summary ?? component.summary
    if (desc) lines.push(`      desc: ${lit(desc)},`)
    lines.push(`      controls: ${JSON.stringify(controls)},`)
    if (component.scenarios.length > 0) {
      // The pipeline's derived scenarios, WITH their verdicts — the sidebar
      // shows the same states, with the same pass/fail labels, that
      // `atlas scan` publishes. Three states on purpose: `unverified` is not a
      // pass, and rendering it as one would be the false-green the verify
      // model exists to prevent.
      const scenarios = component.scenarios.map((s) => ({
        id: s.id,
        name: s.name,
        args: s.args,
        verdict: s.verify
          ? s.verify.ok
            ? ('ok' as const)
            : s.verify.checked > 0
              ? ('fail' as const)
              : ('unverified' as const)
          : ('unverified' as const),
      }))
      lines.push(`      scenarios: ${JSON.stringify(scenarios)},`)
    }
    // The guard is the point: one broken export must not blank the workbench.
    //
    // `ctx` is THREADED, not dropped — the panels that read the render context
    // (Actions, Pseudo-state) were inert for every scanned project while the
    // generated render ignored its second argument:
    //
    //   - every discovered REACTIVE prop gets a logging handler, so a click in
    //     the canvas lands in the Actions ring with zero authoring. A control
    //     value that IS a function (an authored override) still runs after the
    //     log — observation must never swallow behaviour.
    //   - `ctx.pseudo` is spread ONLY onto rocketstyle components
    //     (`IS_ROCKETSTYLE` — runtime truth), where `hover`/`focus`/`active`
    //     are reserved props feeding the component's REAL pseudo CSS. On a
    //     plain function they would just be mystery props, so they are not.
    //     Read inside render, so the forced-state signal re-renders the
    //     preview.
    lines.push(`      render: (props, ctx) => {`)
    lines.push(`        const Comp = __mod${i}[${lit(component.name)}] ?? __mod${i}.default`)
    lines.push(`        if (typeof Comp !== 'function') {`)
    lines.push(
      `          return h('div', { 'data-atlas-error': ${lit(component.name)} }, ` +
        `${lit(`Could not load ${component.name} from `)} + ${lit(entry.file)})`,
    )
    lines.push(`        }`)
    lines.push(`        const merged = { ...props }`)
    if (reactiveProps.length > 0) {
      lines.push(`        for (const name of ${JSON.stringify(reactiveProps)}) {`)
      lines.push(`          const user = merged[name]`)
      lines.push(`          merged[name] = (...args) => {`)
      lines.push(
        `            ctx.logAction(name, args.length ? String(args[0]?.type ?? args[0]) : '')`,
      )
      lines.push(`            if (typeof user === 'function') user(...args)`)
      lines.push(`          }`)
      lines.push(`        }`)
    }
    lines.push(`        if (Comp.IS_ROCKETSTYLE) Object.assign(merged, ctx.pseudo)`)
    if (options.configPath) {
      lines.push(`        const __el = h(__Perms, { value: ctx.can }, h(Comp, merged))`)
      lines.push(`        return __wrapAll(__el)`)
    } else {
      lines.push(`        return h(Comp, merged)`)
    }
    lines.push(`      },`)
    lines.push('    },')
  })

  lines.push('  ],')
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}
