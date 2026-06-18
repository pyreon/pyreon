import { existsSync, readdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import type { Plugin } from 'vite'

import type { IconMode } from './icon'

// ─── iconsPlugin — folder → strictly-typed icon set ─────────────────────────
//
// Point it at a folder of `*.svg` files; it writes a generated `icons.gen.tsx`
// that exports a strictly-typed `<Icon name="…" />`. Add an svg → the `name`
// union widens; remove one → a now-invalid `name` fails typecheck. The
// generated file calls `createNamedIcon(REGISTRY)` so `keyof typeof REGISTRY`
// IS the type surface (autocomplete + real go-to-definition, zero per-app
// wiring — same one-touch shape as fs-router / islands auto-registry).
//
// Two render modes (per the colorful-vs-system split):
//   • mode: 'inline' (default) — system icons. Each svg inlined as raw markup;
//     `currentColor`-themeable, recolor via CSS `color`.
//   • mode: 'image'            — colorful / brand icons. Each svg emitted as a
//     static asset, rendered `<img>`. NO mutation, original colors preserved.
//
//   import { iconsPlugin } from '@pyreon/zero/server'
//   iconsPlugin({ dir: './src/icons' })            // → src/icons.gen.tsx
//
// The generated file exports TWO shapes (inline mode):
//   • Per-icon components (PREFERRED) — tree-shakeable; import only what you
//     use and unused icons are dropped by standard ESM dead-code elimination:
//       import { CheckCircle } from './icons.gen'
//       <span style="width:2rem"><CheckCircle /></span>
//   • `<Icon name="…" />` — the runtime registry, kept as the escape hatch for
//     DYNAMIC / data-driven names (`<Icon name={cmsKey} />`). A `registry[name]`
//     lookup necessarily retains the WHOLE set, so it can't tree-shake — use it
//     only when the name isn't statically known.

/** One named set in the multi-set form. */
export interface IconSetConfig {
  /** Folder of `*.svg` files to scan for this set. */
  dir: string
  /**
   * `'inline'` (default — system icons, `currentColor`-themeable) or
   * `'image'` (colorful / brand icons, rendered `<img>`, no mutation).
   */
  mode?: IconMode
}

export interface IconsPluginConfig {
  /**
   * Single-set form: a folder of `*.svg` files → one `<Icon name="…" />`
   * with a single `IconName` union. Mutually exclusive with `sets`.
   */
  dir?: string
  /**
   * Named multi-set form: `{ ui: { dir }, brand: { dir, mode } }` → one
   * generated file exporting a strictly-typed component PER set with
   * NAMESPACED types so they never clash:
   *   `ui` → `<UiIcon name="…" />` + `type UiIconName`
   *   `brand` → `<BrandIcon name="…" />` + `type BrandIconName`
   * Mutually exclusive with `dir`.
   */
  sets?: Record<string, IconSetConfig>
  /**
   * Where to write the generated `.tsx`. Single-set default: `icons.gen.tsx`
   * next to `dir` (e.g. `src/icons` → `src/icons.gen.tsx`). Multi-set
   * default: `src/icons.gen.tsx` under the project root. Recommend
   * gitignoring it — it's a build artifact.
   */
  out?: string
  /** Single-set form only — render mode (`'inline'` default | `'image'`). */
  mode?: IconMode
}

/** PascalCase a kebab/snake/slug name. `check-circle` → `CheckCircle`. */
function pascalCase(name: string): string {
  return name
    .split(/[-_/\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
    .replace(/[^A-Za-z0-9_$]/g, '')
}

/** Set key → exported component name. `ui` → `UiIcon`, `brand-marks` → `BrandMarksIcon`. */
export function componentNameFromSetKey(key: string): string {
  const safe = pascalCase(key)
  const base = /^[A-Za-z_$]/.test(safe) ? safe : `Set${safe}`
  return `${base}Icon`
}

/**
 * Registry key → PascalCase per-icon component export name. `check-circle` →
 * `CheckCircle`. PascalCase is required: a lowercase JSX tag (`<checkCircle/>`)
 * is treated as a DOM element, not a component. Leading-digit names get an
 * `Icon` prefix so they stay valid identifiers.
 */
export function componentNameFromIconName(name: string): string {
  const safe = pascalCase(name)
  return /^[A-Za-z_$]/.test(safe) ? safe : `Icon${safe}`
}

/** Filename stem → registry key. `Check-Circle.svg` → `check-circle`. */
export function iconNameFromFile(file: string): string {
  return basename(file, '.svg')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

/** Registry key → safe JS import binding. `check-circle` → `checkCircle`. */
function bindingFromName(name: string): string {
  const camel = name.replace(/[-/](.)/g, (_, c: string) => c.toUpperCase())
  const safe = camel.replace(/[^A-Za-z0-9_$]/g, '_')
  return /^[A-Za-z_$]/.test(safe) ? safe : `_${safe}`
}

/** List the `*.svg` filenames in `dir` (sorted, stable). Empty if missing. */
export function scanIconDir(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.svg'))
    .sort()
}

/**
 * Render the generated `.tsx` source for a set of svg filenames. Pure —
 * unit-tested directly; the plugin only adds fs + watch around it.
 */
export function generateIconSetSource(
  files: string[],
  opts: { mode: IconMode; importDir: string },
): string {
  const inline = opts.mode !== 'image'
  const query = inline ? '?raw' : ''
  const seen = new Map<string, string>() // binding → name (collision guard)
  const exportSeen = new Set<string>() // per-icon export name collision guard
  const entries: {
    key: string
    binding: string
    file: string
    exportName: string
  }[] = []
  for (const file of files) {
    const key = iconNameFromFile(file)
    let binding = bindingFromName(key)
    while (seen.has(binding)) binding = `${binding}_`
    seen.set(binding, key)
    // PascalCase per-icon export (inline mode only — see below).
    let exportName = componentNameFromIconName(key)
    while (exportSeen.has(exportName)) exportName = `${exportName}_`
    exportSeen.add(exportName)
    entries.push({ key, binding, file, exportName })
  }

  const header = [
    '// AUTO-GENERATED by @pyreon/zero iconsPlugin — do not edit.',
    `// Add / remove .svg files in ${opts.importDir} and this regenerates.`,
    '/// <reference types="vite/client" />',
    // `createIcon` is only referenced by the per-icon exports (inline mode).
    inline
      ? "import { createIcon, createNamedIcon } from '@pyreon/zero'"
      : "import { createNamedIcon } from '@pyreon/zero'",
  ]
  const imports = entries.map(
    (e) => `import ${e.binding} from '${opts.importDir}/${e.file}${query}'`,
  )
  // Per-icon tree-shakeable component exports (inline mode). Each is an
  // independent `/*#__PURE__*/`-annotated binding, so importing `{ CheckCircle }`
  // drops every other icon AND the `Icon`/`REGISTRY` runtime registry below —
  // standard ESM dead-code elimination, no `name`-string lookup to defeat it.
  //   import { CheckCircle } from './icons.gen';  <CheckCircle />
  const namedExports = inline
    ? [
        '// Per-icon components — import only what you use; unused icons',
        '// tree-shake out (preferred for a bounded, statically-named set):',
        "//   import { CheckCircle } from './icons.gen';  <CheckCircle />",
        ...entries.map(
          (e) =>
            `export const ${e.exportName} = /*#__PURE__*/ createIcon(${e.binding})`,
        ),
      ]
    : []
  const registry = [
    'const REGISTRY = {',
    ...entries.map((e) => `  ${JSON.stringify(e.key)}: ${e.binding},`),
    '} as const',
  ]
  // The `name`-string registry stays as the deliberate escape hatch for
  // DYNAMIC / data-driven names (`<Icon name={cmsKey} />`) — a runtime
  // `registry[name]` lookup that necessarily retains the whole set. For a
  // bounded, statically-named set, prefer the per-icon exports above.
  const tail = [
    'export type IconName = keyof typeof REGISTRY',
    ...(inline
      ? [
          '// Dynamic / data-driven names only: `<Icon name={key} />`. Referencing',
          '// `Icon` pulls the WHOLE set — for static names use the exports above.',
        ]
      : []),
    `export const Icon = ${inline ? '/*#__PURE__*/ ' : ''}createNamedIcon(REGISTRY${
      inline ? '' : ", { mode: 'image' }"
    })`,
    '',
  ]
  return [
    ...header,
    '',
    ...imports,
    ...(namedExports.length ? ['', ...namedExports] : []),
    '',
    ...registry,
    '',
    ...tail,
  ].join('\n')
}

/** One resolved set for the multi-set generator. */
export interface NamedSetInput {
  /** Set key (`ui`) — becomes `<UiIcon>` + `type UiIconName`. */
  key: string
  files: string[]
  mode: IconMode
  /** Relative import dir from the generated file to this set's folder. */
  importDir: string
}

/**
 * Render the generated `.tsx` for the NAMED MULTI-SET form. One file, one
 * `createNamedIcon` import, one strictly-typed component PER set with
 * namespaced types (`UiIcon`/`UiIconName`, `BrandIcon`/`BrandIconName`) so
 * sets never clash. Bindings are per-set-prefixed so two sets sharing a
 * glyph filename don't collide.
 */
export function generateNamedIconSetsSource(sets: NamedSetInput[]): string {
  // `createIcon` is only referenced by inline sets' per-icon exports.
  const anyInline = sets.some((s) => s.mode !== 'image')
  const header = [
    '// AUTO-GENERATED by @pyreon/zero iconsPlugin — do not edit.',
    '// Add / remove .svg files in the configured set folders and this regenerates.',
    '/// <reference types="vite/client" />',
    anyInline
      ? "import { createIcon, createNamedIcon } from '@pyreon/zero'"
      : "import { createNamedIcon } from '@pyreon/zero'",
  ]
  const blocks: string[] = []
  for (const set of sets) {
    const component = componentNameFromSetKey(set.key)
    const typeName = `${component}Name`
    const registry = `${component}_REGISTRY`
    const inline = set.mode !== 'image'
    const query = inline ? '?raw' : ''
    const seen = new Set<string>()
    const exportSeen = new Set<string>()
    // Per-set PascalCase export prefix so two sets sharing a glyph name don't
    // clash: set `ui` + icon `check` → `UiCheck`.
    const exportPrefix = pascalCase(set.key)
    const entries: {
      key: string
      binding: string
      file: string
      exportName: string
    }[] = []
    for (const file of set.files) {
      const k = iconNameFromFile(file)
      // Per-set binding prefix → no cross-set collision even on shared names.
      let binding = `${bindingFromName(set.key)}_${bindingFromName(k)}`
      while (seen.has(binding)) binding = `${binding}_`
      seen.add(binding)
      let exportName = `${exportPrefix}${componentNameFromIconName(k)}`
      while (exportSeen.has(exportName)) exportName = `${exportName}_`
      exportSeen.add(exportName)
      entries.push({ key: k, binding, file, exportName })
    }
    const imports = entries.map(
      (e) => `import ${e.binding} from '${set.importDir}/${e.file}${query}'`,
    )
    // Per-icon tree-shakeable exports (inline sets only — `createIcon` renders
    // raw `?raw` markup; image sets stay registry-only `<img>`).
    const namedExports = inline
      ? [
          `// Per-icon (tree-shakeable): import { ${
            entries[0]?.exportName ?? `${exportPrefix}Foo`
          } } from './icons.gen'`,
          ...entries.map(
            (e) =>
              `export const ${e.exportName} = /*#__PURE__*/ createIcon(${e.binding})`,
          ),
        ]
      : []
    blocks.push(
      [
        `// ── set "${set.key}" → <${component} name="…" /> ──`,
        ...imports,
        ...namedExports,
        `const ${registry} = {`,
        ...entries.map((e) => `  ${JSON.stringify(e.key)}: ${e.binding},`),
        '} as const',
        `export type ${typeName} = keyof typeof ${registry}`,
        `export const ${component} = ${
          inline ? '/*#__PURE__*/ ' : ''
        }createNamedIcon(${registry}${inline ? '' : ", { mode: 'image' }"})`,
      ].join('\n'),
    )
  }
  return [...header, '', blocks.join('\n\n'), ''].join('\n')
}

function resolveOut(cfg: IconsPluginConfig, root: string): string {
  if (cfg.out) return join(root, cfg.out)
  if (cfg.dir) {
    const dir = join(root, cfg.dir)
    return join(dirname(dir), `${basename(dir)}.gen.tsx`)
  }
  // Multi-set form with no explicit `out`.
  return join(root, 'src', 'icons.gen.tsx')
}

/**
 * Vite plugin: scan `dir` for `*.svg`, write a strictly-typed
 * `icons.gen.tsx`, regenerate on add / unlink in dev.
 */
export function iconsPlugin(cfg: IconsPluginConfig): Plugin {
  const hasDir = typeof cfg.dir === 'string'
  const hasSets = !!cfg.sets && Object.keys(cfg.sets).length > 0
  if (hasDir === hasSets) {
    throw new Error(
      '[Pyreon] iconsPlugin: provide EXACTLY ONE of `dir` (single set) or ' +
        '`sets` (named multi-set). ' +
        (hasDir
          ? 'Both were given.'
          : 'Neither was given (or `sets` is empty).'),
    )
  }
  let root = process.cwd()
  const mode: IconMode = cfg.mode ?? 'inline'

  /** Relative `./…` import dir from the generated file to a scanned folder. */
  function rel(out: string, scanned: string): string {
    const r = relative(dirname(out), scanned).split('\\').join('/')
    return r.startsWith('.') ? r : `./${r}`
  }

  async function regenerate(): Promise<void> {
    const out = resolveOut(cfg, root)
    let source: string
    if (hasSets) {
      const sets: NamedSetInput[] = Object.entries(cfg.sets ?? {}).map(
        ([key, sc]) => {
          const scanned = join(root, sc.dir)
          return {
            key,
            files: scanIconDir(scanned),
            mode: sc.mode ?? 'inline',
            importDir: rel(out, scanned),
          }
        },
      )
      source = generateNamedIconSetsSource(sets)
    } else {
      const scanned = join(root, cfg.dir as string)
      source = generateIconSetSource(scanIconDir(scanned), {
        mode,
        importDir: rel(out, scanned),
      })
    }
    // Idempotent — never rewrite identical content (avoids an HMR loop).
    const current = existsSync(out) ? await readFile(out, 'utf8') : null
    if (current !== source) await writeFile(out, source, 'utf8')
  }

  const watchDirs = (): string[] =>
    hasSets
      ? Object.values(cfg.sets ?? {}).map((s) => join(root, s.dir))
      : [join(root, cfg.dir as string)]

  return {
    name: 'pyreon:zero-icons',
    async configResolved(resolved) {
      root = resolved.root
      await regenerate()
    },
    async buildStart() {
      await regenerate()
    },
    configureServer(server) {
      const dirs = watchDirs()
      for (const d of dirs) server.watcher.add(d)
      const onChange = (file: string): void => {
        if (
          file.toLowerCase().endsWith('.svg') &&
          dirs.some((d) => file.startsWith(d))
        ) {
          void regenerate()
        }
      }
      server.watcher.on('add', onChange)
      server.watcher.on('unlink', onChange)
    },
  }
}
