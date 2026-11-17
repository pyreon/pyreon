/**
 * Structural checks of the site design system, over comment-blanked source:
 * where styled components are defined, their names, the kit's import
 * boundary, what islands pull in, gallery coverage and two a11y basics.
 * Every function is pure over `SourceFile`s, so the tests feed it fixtures.
 */
import { posix } from 'node:path'

export type StructureRule =
  | 'kit/styled-outside'
  | 'kit/extend-css'
  | 'kit/duplicate-name'
  | 'kit/imports-app'
  | 'kit/internal-import'
  | 'kit/island-styling-runtime'
  | 'kit/gallery-missing'
  | 'a11y/focus-missing'
  | 'a11y/motion-unguarded'

export interface SourceFile {
  /** Repo-relative, `docs/src/…`. */
  path: string
  /** Comment-blanked text. */
  text: string
}

export interface Finding {
  file: string
  line: number
  rule: StructureRule
  detail: string
}

export const SRC = 'docs/src'
const KIT = `${SRC}/site/kit/`
const DEMOS = `${SRC}/site/demos/`
/** Kit modules that are its machinery, not its components: a styled base and the islands' stylesheet. */
export const KIT_INTERNALS = [`${KIT}bases`, `${KIT}site-css`]
/** What the kit must never import: the app around it. */
const APP_DIRS = ['site/pages/', 'site/shell/', 'site/demos/', 'blog/', 'showcase/', 'open/', 'routes/', 'docs-ui/', 'components/', 'mdx/'].map((d) => `${SRC}/${d}`)
/** Packages that make up the UI system's styling runtime (~25 KB gzip in an island). */
export const STYLING_RUNTIME = ['@pyreon/rocketstyle', '@pyreon/styler', '@pyreon/unistyle', '@pyreon/elements', '@pyreon/ui-core', '@pyreon/coolgrid', '@pyreon/kinetic', '@pyreon/attrs']
export const GALLERY_FILES = [
  `${SRC}/site/pages/KitGallery.tsx`,
  `${SRC}/site/pages/KitGalleryLive.tsx`,
  `${SRC}/site/pages/KitScopePills.tsx`,
  `${SRC}/site/pages/KitGalleryPrimitives.tsx`,
]

const inKit = (p: string): boolean => p.startsWith(KIT)
const inDemos = (p: string): boolean => p.startsWith(DEMOS)
const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length

const DEF_RE = /\.config\(\s*\{\s*name\s*:\s*['"`]([^'"`]+)['"`]/g

/** Styled definitions and `extendCss` outside the kit (demos excepted: a demo depicts an app). */
export function styledOutsideKit(files: readonly SourceFile[]): Finding[] {
  const out: Finding[] = []
  for (const f of files) {
    if (inKit(f.path) || inDemos(f.path)) continue
    for (const m of f.text.matchAll(DEF_RE)) out.push({ file: f.path, line: lineOf(f.text, m.index), rule: 'kit/styled-outside', detail: m[1] as string })
    for (const m of f.text.matchAll(/\b(?:rocketstyle|styled)\s*\(/g)) out.push({ file: f.path, line: lineOf(f.text, m.index), rule: 'kit/styled-outside', detail: m[0] })
    for (const m of f.text.matchAll(/\bextendCss\b/g)) out.push({ file: f.path, line: lineOf(f.text, m.index), rule: 'kit/extend-css', detail: 'extendCss' })
  }
  return out
}

/** A styled-component name defined more than once: every occurrence but the first (kit first, then by path). */
export function duplicateNames(files: readonly SourceFile[]): Finding[] {
  const seen = new Map<string, { file: string; line: number }[]>()
  const ordered = [...files].sort((a, b) => Number(inKit(b.path)) - Number(inKit(a.path)) || a.path.localeCompare(b.path))
  for (const f of ordered) {
    for (const m of f.text.matchAll(DEF_RE)) {
      const name = m[1] as string
      const list = seen.get(name) ?? []
      list.push({ file: f.path, line: lineOf(f.text, m.index) })
      seen.set(name, list)
    }
  }
  const out: Finding[] = []
  for (const [name, defs] of seen) {
    for (const d of defs.slice(1)) out.push({ ...d, rule: 'kit/duplicate-name', detail: `${name} (also ${defs[0]?.file}:${defs[0]?.line})` })
  }
  return out
}

export interface ImportRef {
  spec: string
  line: number
  dynamic: boolean
}

/** Value imports of a file (`import type` and `export type` are not dependencies at runtime). */
export function importsOf(text: string): ImportRef[] {
  const out: ImportRef[] = []
  for (const m of text.matchAll(/^\s*(import|export)\s+(?!type\b)(?:[\w*{}\s,$]*?\sfrom\s*)?['"]([^'"]+)['"]/gm)) {
    out.push({ spec: m[2] as string, line: lineOf(text, m.index), dynamic: false })
  }
  for (const m of text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push({ spec: m[1] as string, line: lineOf(text, m.index), dynamic: true })
  return out
}

/** Resolve a relative specifier to a known source path, or `null` (package, asset, unknown). */
export function resolveImport(from: string, spec: string, known: ReadonlySet<string>): string | null {
  if (!spec.startsWith('.')) return null
  const base = posix.normalize(posix.join(posix.dirname(from), spec.split('?')[0] as string))
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) if (known.has(cand)) return cand
  return null
}

const stripExt = (p: string): string => p.replace(/\.(tsx?|css)$/, '')

function kitDeepImport(target: string): boolean {
  if (KIT_INTERNALS.includes(stripExt(target))) return true
  const rest = target.slice(KIT.length)
  return rest.includes('/') && !/\/index\.tsx?$/.test(rest)
}

/** Kit → app imports, and imports of kit internals from outside the kit (demos excepted). */
export function kitBoundary(files: readonly SourceFile[]): Finding[] {
  const known = new Set(files.map((f) => f.path))
  const out: Finding[] = []
  for (const f of files) {
    for (const imp of importsOf(f.text)) {
      const target = resolveImport(f.path, imp.spec, known)
      if (!target) continue
      if (inKit(f.path) && APP_DIRS.some((d) => target.startsWith(d))) {
        out.push({ file: f.path, line: imp.line, rule: 'kit/imports-app', detail: imp.spec })
      } else if (!inKit(f.path) && !inDemos(f.path) && inKit(target) && kitDeepImport(target)) {
        out.push({ file: f.path, line: imp.line, rule: 'kit/internal-import', detail: imp.spec })
      }
    }
  }
  return out
}

/** The first styling-runtime package reachable through static imports from `entry`, with the chain. */
export function stylingChain(entry: string, byPath: ReadonlyMap<string, SourceFile>): string[] | null {
  const known = new Set(byPath.keys())
  const parent = new Map<string, string | null>([[entry, null]])
  const queue = [entry]
  while (queue.length > 0) {
    const cur = queue.shift() as string
    for (const imp of importsOf(byPath.get(cur)?.text ?? '')) {
      if (imp.dynamic) continue
      const pkg = STYLING_RUNTIME.find((p) => imp.spec === p || imp.spec.startsWith(`${p}/`))
      const chain = (end: string): string[] => {
        const c = [end]
        for (let p: string | null | undefined = cur; p; p = parent.get(p)) c.unshift(p)
        return c
      }
      if (pkg) return chain(pkg)
      const next = resolveImport(cur, imp.spec, known)
      if (next && !parent.has(next)) {
        parent.set(next, cur)
        queue.push(next)
      }
    }
  }
  return null
}

/** Islands declared outside `site/demos/` whose module pulls the styling runtime into the browser. */
export function islandStylingRuntime(files: readonly SourceFile[]): Finding[] {
  const byPath = new Map(files.map((f) => [f.path, f]))
  const out: Finding[] = []
  for (const f of files) {
    if (inDemos(f.path)) continue
    for (const m of f.text.matchAll(/\bisland\(\s*\(\s*\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const entry = resolveImport(f.path, m[1] as string, new Set(byPath.keys()))
      if (!entry || inDemos(entry)) continue
      const chain = stylingChain(entry, byPath)
      if (chain) out.push({ file: f.path, line: lineOf(f.text, m.index), rule: 'kit/island-styling-runtime', detail: chain.join(' → ') })
    }
  }
  return out
}

/** Kit subfolders whose files are public components (through the folder's index), held to the gallery like top-level kit files. */
export const GALLERY_SUBFOLDERS = ['primitives/']

/** Exported components of the kit's top-level `.tsx` files (and of `GALLERY_SUBFOLDERS`) that no gallery file names. */
export function galleryMissing(files: readonly SourceFile[]): Finding[] {
  const gallery = files.filter((f) => GALLERY_FILES.includes(f.path)).map((f) => f.text).join('\n')
  const out: Finding[] = []
  for (const f of files) {
    const rest = f.path.slice(KIT.length)
    if (!inKit(f.path) || !f.path.endsWith('.tsx') || (rest.includes('/') && !GALLERY_SUBFOLDERS.some((d) => rest.startsWith(d)))) continue
    for (const m of f.text.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9]*)/gm)) {
      const name = m[1] as string
      if (!/[a-z]/.test(name) || new RegExp(`\\b${name}\\b`).test(gallery)) continue
      out.push({ file: f.path, line: lineOf(f.text, m.index), rule: 'kit/gallery-missing', detail: name })
    }
  }
  return out
}

/** Top-level statements (a statement starts at a column-0 line that does not continue a chain). */
export function statements(text: string): { start: number; body: string }[] {
  const lines = text.split('\n')
  const out: { start: number; body: string[] }[] = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] as string
    const starts = /^[^\s.)}\]]/.test(l)
    if (starts || out.length === 0) out.push({ start: i + 1, body: [l] })
    else out[out.length - 1]?.body.push(l)
  }
  return out.map((s) => ({ start: s.start, body: s.body.join('\n') }))
}

const INTERACTIVE_TAG = /\btag\s*:\s*['"](?:a|button|summary)['"]/
const FOCUS_STYLE = /\bfocus\s*:|focusRing|:focus-visible|:focus\b/

/** Styled definitions rendering an `a`, `button` or `summary` with no focus style of their own. */
export function focusMissing(files: readonly SourceFile[]): Finding[] {
  const out: Finding[] = []
  for (const f of files) {
    if (!f.path.endsWith('.tsx') && !f.path.endsWith('.ts')) continue
    for (const s of statements(f.text)) {
      const def = /\.config\(\s*\{\s*name\s*:\s*['"`]([^'"`]+)/.exec(s.body)
      if (!def || !INTERACTIVE_TAG.test(s.body) || FOCUS_STYLE.test(s.body)) continue
      out.push({ file: f.path, line: s.start, rule: 'a11y/focus-missing', detail: def[1] as string })
    }
  }
  return out
}

const MOTION_DECL = /(?<![\w$.-])(?:transition|animation)(?:-[a-z]+|[A-Z][a-z]+)?\s*:(?!\s*['"]?none\b)|@keyframes\b|\bkeyframes`/g
const MOTION_GUARD = /prefers-reduced-motion|\breducedMotion\b/

/** Motion in a file that never mentions reduced motion (per file: one guard covers the file). */
export function motionUnguarded(files: readonly SourceFile[]): Finding[] {
  const out: Finding[] = []
  for (const f of files) {
    if (MOTION_GUARD.test(f.text)) continue
    for (const m of f.text.matchAll(MOTION_DECL)) out.push({ file: f.path, line: lineOf(f.text, m.index), rule: 'a11y/motion-unguarded', detail: m[0].trim() })
  }
  return out
}

/** Every structural finding. */
export function scanStructure(files: readonly SourceFile[]): Finding[] {
  return [...styledOutsideKit(files), ...duplicateNames(files), ...kitBoundary(files), ...islandStylingRuntime(files), ...galleryMissing(files), ...focusMissing(files), ...motionUnguarded(files)]
}
