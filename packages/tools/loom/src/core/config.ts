/**
 * Reading loom's settings from the ecosystem-wide `pyreon.config.*`.
 *
 * ── Why this is separate from `scanWorkspace` ─────────────────────────────
 *
 * `buildReport` is synchronous, and importing a config module is not. Rather
 * than make the whole analysis async — which would ripple into the dev server,
 * every test, and the report API — the CLI resolves config FIRST and hands the
 * result to `buildReport` as options. The core stays a pure synchronous
 * function of (workspace, options), which is what makes it testable without a
 * filesystem full of config files.
 *
 * ── Loading a TypeScript config without a bundler ─────────────────────────
 *
 * `loom scan` deliberately has no bundler: vite is an OPTIONAL peer that only
 * `loom dev` needs. So this uses a plain dynamic `import()`, which resolves
 * `.js`/`.mjs` everywhere and `.ts` on any runtime that strips types (Bun, and
 * Node from v22.6 with the flag / v23.6 by default).
 *
 * When it cannot, the file is NAMED and the run fails. Silently ignoring a
 * config file that exists is the single failure this whole config surface was
 * created to reduce — a project that wrote settings and had them dropped gets
 * a puzzling afternoon, where a project that wrote none should hear nothing.
 */
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { CONFIG_FILENAMES, sectionFrom } from '@pyreon/config'
import type { IssueCode, IssueSeverity, LoomIgnore } from './types'

/** The settings loom reads, from either home. */
export interface LoomSettings {
  devPaths: string[]
  ignores: LoomIgnore[]
  strict?: boolean
  severity: Partial<Record<IssueCode, IssueSeverity>>
}

/** Every code a `severity` override may name — unknown keys are rejected. */
export const ISSUE_CODES: readonly IssueCode[] = [
  'version-drift',
  'internal-range',
  'cycle',
  'phantom-dep',
  'phantom-type-dep',
  'prod-import-of-dev-dep',
  'unused-dep',
  'peer-mismatch',
]

const SEVERITIES: readonly IssueSeverity[] = ['error', 'warning', 'info']

const bad = (msg: string): never => {
  throw new Error(`[Pyreon] loom: ${msg}`)
}

/**
 * Validate one `loom` section, wherever it came from.
 *
 * Shared by BOTH homes on purpose: `package.json`'s `loom` key and
 * `pyreon.config.*`'s `loom` section are the same shape, so they must fail the
 * same way. Two validators would let one home accept what the other rejects,
 * which is a config that works until you move it.
 */
export function validateLoomSection(raw: unknown, where: string): Partial<LoomSettings> {
  if (raw === undefined) return {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    bad(`${where}: \`loom\` must be an object.`)
  }
  const section = raw as Record<string, unknown>
  const out: Partial<LoomSettings> = {}

  if (section.devPaths !== undefined) {
    const v = section.devPaths
    if (!Array.isArray(v) || v.some((g) => typeof g !== 'string')) {
      bad(
        `${where}: \`loom.devPaths\` must be an array of package-relative globs ` +
          '(e.g. ["src/manifest.ts", "**/*.gen.ts"]).',
      )
    }
    out.devPaths = v as string[]
  }

  if (section.ignore !== undefined) {
    const v = section.ignore
    if (!Array.isArray(v)) {
      bad(`${where}: \`loom.ignore\` must be an array of { pkg?, dep?, code?, reason } objects.`)
    }
    out.ignores = (v as unknown[]).map((entry) => {
      const e = entry as Record<string, unknown>
      if (typeof e?.reason !== 'string' || e.reason.trim() === '') {
        bad(
          `${where}: every \`loom.ignore\` entry needs a non-empty \`reason\` — an unexplained ` +
            `suppression is a lie waiting to age (offending entry: ${JSON.stringify(entry)}).`,
        )
      }
      return {
        ...(typeof e.pkg === 'string' ? { pkg: e.pkg } : {}),
        ...(typeof e.dep === 'string' ? { dep: e.dep } : {}),
        ...(typeof e.code === 'string' ? { code: e.code } : {}),
        reason: e.reason as string,
      }
    })
  }

  if (section.strict !== undefined) {
    if (typeof section.strict !== 'boolean') bad(`${where}: \`loom.strict\` must be a boolean.`)
    out.strict = section.strict as boolean
  }

  if (section.severity !== undefined) {
    const v = section.severity
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      bad(`${where}: \`loom.severity\` must be an object keyed by issue code.`)
    }
    const severity: Partial<Record<IssueCode, IssueSeverity>> = {}
    for (const [code, level] of Object.entries(v as Record<string, unknown>)) {
      if (!ISSUE_CODES.includes(code as IssueCode)) {
        bad(
          `${where}: \`loom.severity\` names an unknown code \`${code}\`. ` +
            `Known codes: ${ISSUE_CODES.join(', ')}.`,
        )
      }
      if (typeof level !== 'string' || !SEVERITIES.includes(level as IssueSeverity)) {
        bad(
          `${where}: \`loom.severity.${code}\` must be one of ${SEVERITIES.join(' | ')} ` +
            `(got ${JSON.stringify(level)}).`,
        )
      }
      severity[code as IssueCode] = level as IssueSeverity
    }
    out.severity = severity
  }

  return out
}

/**
 * Merge the two homes. The root `package.json`'s `loom` key wins PER KEY.
 *
 * Per-key rather than whole-object so a project can keep one setting in the
 * manifest and the rest in the shared file without the manifest silently
 * blanking everything it does not mention.
 */
export function mergeLoomSettings(
  shared: Partial<LoomSettings>,
  manifest: Partial<LoomSettings>,
): LoomSettings {
  return {
    devPaths: manifest.devPaths ?? shared.devPaths ?? [],
    ignores: manifest.ignores ?? shared.ignores ?? [],
    ...(manifest.strict ?? shared.strict) !== undefined
      ? { strict: manifest.strict ?? shared.strict }
      : {},
    severity: { ...shared.severity, ...manifest.severity },
  }
}

/**
 * The `loom` key of the root `package.json`, unvalidated.
 *
 * Read separately from `scanWorkspace` (which also parses this manifest) so
 * both homes go through {@link validateLoomSection} — the manifest home
 * predates the shared file and must not keep a second, laxer validator.
 */
export function readManifestLoomSection(cwd: string): unknown {
  try {
    const raw = readFileSync(resolve(cwd, 'package.json'), 'utf8')
    return (JSON.parse(raw) as { loom?: unknown }).loom
  } catch {
    // No manifest, or unreadable — `scanWorkspace` reports that far better
    // than a config loader can, and will run moments later.
    return undefined
  }
}

/**
 * Load the `loom` section of `pyreon.config.*`, if the project has one.
 *
 * Returns `{}` when there is no config file, or one with no `loom` key — a
 * project configuring some other tool is not an error. Throws when a file
 * EXISTS and cannot be loaded, naming it.
 */
export async function loadSharedLoomConfig(cwd: string): Promise<Partial<LoomSettings>> {
  const found = CONFIG_FILENAMES.map((name) => resolve(cwd, name)).find((f) => existsSync(f))
  if (!found) return {}

  let mod: Record<string, unknown>
  try {
    mod = (await import(pathToFileURL(found).href)) as Record<string, unknown>
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(
      `[Pyreon] loom: could not load ${found} — ${detail}\n` +
        '  `loom scan` has no bundler (vite is an optional peer used only by `loom dev`), so a\n' +
        '  TypeScript config needs a runtime that strips types: Bun, or Node >= 23.6. On an older\n' +
        '  Node, write the config as `pyreon.config.mjs`, or keep loom settings under the `loom`\n' +
        '  key of package.json — both are read identically.',
    )
  }
  return validateLoomSection(sectionFrom(mod, 'loom'), found)
}
