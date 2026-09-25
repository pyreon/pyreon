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
import { catalogReplacer, componentKey, type ComponentIntelligence, type PropControl } from '../core'
import { relative } from 'node:path'

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
/**
 * The args a scenario can carry as JSON — a function (a render-prop child) or
 * a vnode built with `h` is dropped, key by key. See `catalogReplacer` for
 * the file-side twin, which MARKS them instead so a reader knows.
 */
export function linkableArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (JSON.stringify(value, catalogReplacer) === JSON.stringify(value)) out[key] = value
  }
  return out
}

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
export function toWorkbenchControl(
  control: PropControl,
  /** The component's content seed for this prop — the default when the prop declares none. */
  seeded?: unknown,
): {
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
    // No fabricated `0`. A number prop with no declared default keeps the
    // COMPONENT's own default when the control is blank — `0` was handed to
    // `RingProgress`'s `size` and rendered a 0×0 ring on the deployed
    // workbench, reading as "this component renders nothing".
    return { key: control.name, label, type: 'number', default: control.defaultValue, ...(control.required ? { required: true } : {}) }
  }
  if (control.kind === 'color') {
    return { key: control.name, label, type: 'color', default: control.defaultValue ?? '#3b82f6', ...(control.required ? { required: true } : {}) }
  }
  // Everything else edits as text. A STRING prop with no default starts empty;
  // a prop whose type Atlas could not classify (an object, a VNode, a union
  // of shapes) starts UNSET, for the same reason a number gets no fabricated
  // `0`: `''` is a value the component never expected. A generated `@pyreon/lathe`
  // preview took `data: ''` as "render this" and showed a record of dashes
  // instead of requesting its data.
  const fallback = typeof seeded === 'string' ? seeded : control.kind === 'unknown' ? undefined : ''
  return { key: control.name, label, type: 'text', default: control.defaultValue ?? fallback, ...(control.required ? { required: true } : {}) }
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
  /** Part → parent component name — see `AtlasConfig.parts`. */
  parts?: Record<string, string>
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
/**
 * The workbench ids, in catalog order — the SINGLE owner of that computation.
 *
 * Ids from the identity KEY, not the name. Two packages' `Button`s would
 * otherwise slugify to `button` and `button-2` — unique, but arbitrary: which
 * one got the suffix depends on discovery order, so a URL or a `data-testid`
 * could point at the other package's component after an unrelated file was
 * added. From the key they are `core-button` and `admin-button`: stable, and
 * readable. Outside a monorepo the key IS the name, so nothing changes.
 *
 * Extracted because `atlas build` now emits a DIRECTORY per component and the
 * page has to find itself by matching its own path against these ids. Deriving
 * them twice is how the directory `core/button` and the id `core-button` came
 * to disagree — the key carries a `/` and the id does not, so every
 * per-component URL in a monorepo would have missed.
 */
export function catalogIds(
  entries: readonly CatalogEntrySource[],
  options: GenerateOptions,
): string[] {
  return uniqueIds(sortEntries(entries, options).map((e) => componentKey(e.component)))
}

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
  const ids = catalogIds(entries, options)
  const lines: string[] = [
    "import { h } from '@pyreon/core'",
    // The SAME materializer the verify harness uses — one implementation, so a
    // seed that verified renders identically on the canvas.
    "import { materializeContent as __content } from '@pyreon/atlas/core'",
    '',
  ]

  // Component modules are imported INDIVIDUALLY and non-fatally.
  //
  // These used to be static `import * as __modN from '…'`. A static import
  // cannot be caught, so one component whose own imports do not resolve failed
  // the whole generated module — and the workbench died entirely rather than
  // losing one card. That is what made a single aliased import take down the
  // entire catalog (#2744): every other component was fine and none of them
  // rendered.
  //
  // A caught dynamic import per component keeps the failure local. The render
  // path below already degrades to an error card when a component is not a
  // function, so nothing downstream changes — that branch simply becomes
  // reachable, which it never was for this failure mode.
  //
  // Top-level await is fine here: this is an ESM module served by Vite, and
  // the imports were already blocking as static ones.
  lines.push('const __load = (p) => p.then((m) => m, (err) => ({ __atlasError: err }))')
  lines.push(
    `const [${ordered.map((_, i) => `__mod${i}`).join(', ')}] = await Promise.all([`,
  )
  ordered.forEach((entry) => {
    lines.push(`  __load(import(${lit(entry.file)})),`)
  })
  lines.push('])')
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
    // An AUTHORED scenario's args are read from the config module itself —
    // the same object the verify harness mounted — so a render-prop child or
    // a vnode built with `h` in `atlas.config.ts` reaches the canvas intact.
    // The JSON copy is the fallback for a config the browser cannot import.
    lines.push('const __authored = (key, name, scen, fallback) => {')
    lines.push('  const all = __section.scenarios ?? __config.scenarios')
    lines.push('  const list = all?.[key] ?? all?.[name]')
    lines.push('  const hit = Array.isArray(list) ? list.find((s) => s?.name === scen) : undefined')
    lines.push('  return hit?.args ?? fallback')
    lines.push('}')
    lines.push('')
  }

  lines.push('export const catalog = {')
  if (options.presets) lines.push(`  presets: ${JSON.stringify(options.presets)},`)
  lines.push('  components: [')

  ordered.forEach((entry, i) => {
    const { component } = entry
    const controls = component.controls
      .filter(isEditableControl)
      .map((c) => toWorkbenchControl(c, component.content?.[c.name]))
    // The discovered EVENT surface. `reactive` means only "function-valued";
    // it also includes render props such as `children`/`renderItem`. Fabricating
    // one of those changes component behaviour even when the user supplied no
    // callback (Combobox sees a function child, enters its render-prop escape
    // hatch, and renders the logger's `undefined` return). The framework's
    // event contract is `on[A-Z]`, so observe exactly that subset.
    const reactiveProps = component.controls
      .filter((c) => c.reactive && /^on[A-Z]/.test(c.name))
      .map((c) => c.name)
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
      const items = component.scenarios.map((s) => {
        const verdict = s.verify
          ? s.verify.ok
            ? 'ok'
            : s.verify.checked > 0
              ? 'fail'
              : 'unverified'
          : 'unverified'
        // An authored scenario's args are read LIVE from the config (a render-prop
        // child, a vnode tree); a derived scenario's JSON copy DROPS what JSON
        // cannot carry — those keys come back at render time from the authored
        // Default the derived scenario was built on (`__base` below), so the
        // marker string the catalog file shows is never handed to a component.
        const args =
          s.source === 'authored' && options.configPath
            ? `__authored(${lit(key)}, ${lit(component.name)}, ${lit(s.name)}, ${JSON.stringify(s.args, catalogReplacer)})`
            : JSON.stringify(linkableArgs(s.args))
        return `{ id: ${lit(s.id)}, name: ${lit(s.name)}, source: ${lit(s.source)}, args: ${args}, verdict: ${lit(verdict)} }`
      })
      lines.push(`      scenarios: [${items.join(', ')}],`)
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
    // The module's OWN load error when there was one: "Cannot find module
    // '~/shared/tokens'" names the fix, "could not load Badge" names a symptom.
    lines.push(`          const why = __mod${i}.__atlasError`)
    lines.push(
      `          return h('div', { 'data-atlas-error': ${lit(component.name)} }, ` +
        `why ? ${lit(`${component.name} failed to load: `)} + (why.message ?? String(why)) ` +
        // Project-relative: this string ships in a built site, and the
        // absolute path would publish the build machine's directory layout.
        `: ${lit(`Could not load ${component.name} from `)} + ${lit(relative(options.root, entry.file))})`,
    )
    lines.push(`        }`)
    // Content merges UNDER the control values: the seed is what renders when
    // the user has said nothing, and clearing the `children` field to '' is a
    // real edit that wins. The layout-blocks marker has no control, so it
    // always comes from here.
    // Seed, then the authored Default's live args, then the scenario/control
    // values — the same order the content plugin used when the scan verified.
    const base = options.configPath
      ? `__authored(${lit(key)}, ${lit(component.name)}, "Default", {})`
      : '{}'
    lines.push(`        const merged = { ...${JSON.stringify(component.content ?? {})}, ...${base}, ...props }`)
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
    // An overlay seeded `open: true` closes the way a real app closes it:
    // its `onClose` writes the `open` control back, so Escape / the backdrop
    // dismiss the preview and the Controls panel shows it dismissed.
    if (controls.some((c) => c.key === 'open')) {
      lines.push(`        if (typeof merged.onClose !== 'function') {`)
      lines.push(`          merged.onClose = () => { ctx.logAction('onClose', ''); ctx.setValue('open', false) }`)
      lines.push(`        }`)
    }
    lines.push(`        if (Comp.IS_ROCKETSTYLE) Object.assign(merged, ctx.pseudo)`)
    lines.push(`        const { props: __p, children: __c } = __content(merged, h)`)
    if (options.configPath) {
      lines.push(`        const __el = h(__Perms, { value: ctx.can }, h(Comp, __p, ...__c))`)
      lines.push(`        return __wrapAll(__el)`)
    } else {
      lines.push(`        return h(Comp, __p, ...__c)`)
    }
    lines.push(`      },`)
    lines.push('    },')
  })

  lines.push('  ],')
  lines.push('}')
  if (options.parts && Object.keys(options.parts).length > 0) {
    // A PART renders as its parent's opening scenario: a tab panel shown
    // inside its tabs, an accordion item inside its accordion. Its own render
    // would be empty (no context), and an empty canvas says nothing. Resolved
    // at module evaluation, by name, so a part whose parent is not in the
    // catalog simply keeps its own render.
    lines.push('')
    lines.push(`const __parts = ${JSON.stringify(options.parts)}`)
    lines.push('const __opening = (c) => (c.scenarios?.find((s) => s.name === "Default") ?? c.scenarios?.[0])?.args ?? {}')
    lines.push('for (const [part, parent] of Object.entries(__parts)) {')
    lines.push('  const p = catalog.components.find((c) => c.name === part)')
    lines.push('  const par = catalog.components.find((c) => c.name === parent)')
    lines.push('  if (!p || !par || p === par) continue')
    lines.push('  p.partOf = par.id')
    lines.push('  p.render = (_props, ctx) => par.render(__opening(par), ctx)')
    lines.push('}')
  }
  lines.push('')
  return lines.join('\n')
}
