/**
 * Generated-API-client support for the MCP server.
 *
 * `lathe generate` writes `api-surface.json` next to the client it generated:
 * every operation's method, path, parameters, body, response and stream, each
 * model's fields, and — since the surface started recording them — the module
 * each operation lives in and the symbols it exports. That is exactly what an
 * agent writing a call against the API needs, and nothing served it: an
 * assistant asked to "load the order and show its customer" read the spec, or
 * guessed the hook name, or wrote a raw `fetch`.
 *
 * ── Why this READS the surface for the index tools ─────────────────────────
 *
 * Same reasoning as `atlas.ts` and `loom.ts`: the surface is the artifact of
 * the run that produced the code in the repo, so it is right by construction
 * about the code the agent will import — a re-read of the spec could describe
 * an API the committed client does not implement. It also keeps these tools
 * cheap and working against a surface written by another Lathe version.
 *
 * ── Why the DIFF tool imports @pyreon/lathe ────────────────────────────────
 *
 * Classifying a change as breaking is not a lookup, it is the client-side
 * severity model in `@pyreon/lathe/core` (a response field turning optional
 * breaks, a request field doing so does not). Re-implementing it here would
 * be a second classifier free to disagree with `lathe diff` and `lathe
 * check` — so the tool calls the same code, loaded lazily so the server's
 * startup does not pay for it.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { ApiSurface, SurfaceChange, SurfaceOperation } from '@pyreon/lathe/core'

export const SURFACE_FILENAME = 'api-surface.json'
/** Written by every generation run beside the surface — marks a Lathe OUTPUT. */
const MANIFEST_FILENAME = 'lathe-manifest.json'
const SKIP = new Set(['node_modules', '.git', 'lib', 'dist', 'build', 'coverage', '.cache'])

export const MISSING_SURFACE_MESSAGE = [
  'No generated API client found (no `api-surface.json` next to a `lathe-manifest.json` under the current directory).',
  '',
  'Generate one with:',
  '',
  '    npx @pyreon/lathe generate ./openapi.yaml     # writes ./src/gen by default',
  '',
  'Or pass `path` pointing at the generated directory or its api-surface.json.',
].join('\n')

/** Every generated client under `root` (bounded depth), most shallow first. */
export function findSurfaces(root: string, maxDepth = 6): string[] {
  const out: string[] = []
  const walk = (dir: string, depth: number): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    if (entries.includes(SURFACE_FILENAME) && entries.includes(MANIFEST_FILENAME)) {
      out.push(join(dir, SURFACE_FILENAME))
    }
    if (depth >= maxDepth) return
    for (const name of entries.sort()) {
      if (SKIP.has(name) || name.startsWith('.')) continue
      const child = join(dir, name)
      try {
        if (statSync(child).isDirectory()) walk(child, depth + 1)
      } catch {
        // A dangling symlink or a permission error is not a surface.
      }
    }
  }
  walk(root, 0)
  return out
}

export interface LoadedSurface {
  surface: ApiSurface
  path: string
  /** The generated directory, relative to the cwd — the import base for examples. */
  base: string
}

export type LoadSurfacesResult =
  | { ok: true; surfaces: LoadedSurface[] }
  | { ok: false; reason: 'missing' | 'unreadable'; detail?: string }

/** Load the surface(s): an explicit `path` (file or directory), else a search from `cwd`. */
export function loadSurfaces(cwd: string, path?: string): LoadSurfacesResult {
  let paths: string[]
  if (path !== undefined) {
    const abs = isAbsolute(path) ? path : resolve(cwd, path)
    const file = existsSync(abs) && statSync(abs).isDirectory() ? join(abs, SURFACE_FILENAME) : abs
    if (!existsSync(file)) return { ok: false, reason: 'missing', detail: `${relative(cwd, file) || file} does not exist` }
    paths = [file]
  } else {
    paths = findSurfaces(cwd)
    if (paths.length === 0) return { ok: false, reason: 'missing' }
  }
  const surfaces: LoadedSurface[] = []
  for (const p of paths) {
    try {
      const surface = JSON.parse(readFileSync(p, 'utf8')) as ApiSurface
      if (surface?.version !== 2 || typeof surface.operations !== 'object') {
        return {
          ok: false,
          reason: 'unreadable',
          detail: `${p} is not a version-2 API surface — regenerate with \`lathe generate\``,
        }
      }
      const dir = relative(cwd, dirname(p))
      surfaces.push({ surface, path: p, base: dir === '' ? '.' : dir.startsWith('.') ? dir : `./${dir}` })
    } catch (err) {
      return { ok: false, reason: 'unreadable', detail: `${p}: ${String(err)}` }
    }
  }
  return { ok: true, surfaces }
}

/** Placeholders in a Pyreon path: `/pets/:petId` → `petId`. */
function pathParamNames(path: string): Set<string> {
  return new Set([...path.matchAll(/(?<!\\):([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1] as string))
}

const isQuery = (op: SurfaceOperation): boolean =>
  op.method === 'GET' || op.method === 'HEAD' || op.method === 'OPTIONS'

function hookOf(op: SurfaceOperation): string | undefined {
  return op.symbols?.find((s) => s.startsWith('use') && !s.endsWith('Stream') && !s.endsWith('Infinite'))
}

/** Every operation (optionally matching `search`) and every model, grouped by module. */
export function renderClientIndex(loaded: readonly LoadedSurface[], search?: string): string {
  const needle = search?.toLowerCase()
  const lines: string[] = []
  for (const { surface, base } of loaded) {
    const ops = Object.values(surface.operations).filter(
      (op) =>
        !needle ||
        op.id.toLowerCase().includes(needle) ||
        op.path.toLowerCase().includes(needle) ||
        (op.summary ?? '').toLowerCase().includes(needle),
    )
    lines.push(`# ${surface.title} — ${Object.keys(surface.operations).length} operation(s), ${Object.keys(surface.models).length + Object.keys(surface.aliases ?? {}).length} model(s)`)
    lines.push(`generated at \`${base}\``, '')
    const byModule = new Map<string, SurfaceOperation[]>()
    for (const op of ops) {
      const key = op.module ?? '(module not recorded)'
      byModule.set(key, [...(byModule.get(key) ?? []), op])
    }
    for (const [module, list] of [...byModule].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`## ${module}`)
      for (const op of list) {
        const syms = op.symbols && op.symbols.length > 0 ? ` → ${op.symbols.map((s) => `\`${s}\``).join(', ')}` : ''
        lines.push(`- \`${op.id}\` ${op.method} ${op.path}${op.stream ? ` (streams ${op.stream})` : ''}${op.summary ? ` — ${op.summary}` : ''}${syms}`)
      }
      lines.push('')
    }
    if (needle && ops.length === 0) lines.push(`No operation matches \`${search}\`.`, '')
    if (!needle) {
      const models = Object.keys(surface.models).sort()
      const aliases = Object.keys(surface.aliases ?? {}).sort()
      if (models.length + aliases.length > 0) {
        lines.push('## Models')
        for (const m of models) lines.push(`- \`${m}\` (${Object.keys(surface.models[m] ?? {}).length} fields, ${surface.usage?.[m] ?? 'unused'})`)
        for (const a of aliases) lines.push(`- \`${a}\` = ${surface.aliases?.[a]?.type}`)
        lines.push('')
      }
    }
  }
  lines.push('Call `get_api_operation({ operation })` for one operation\'s typed signature and an example call.')
  return lines.join('\n')
}

/** A literal a rendered type accepts, for example calls. */
function sampleFor(type: string, surface: ApiSurface): string {
  const t = type.replace(/ \(optional\)$/, '')
  const e = /^enum\((.*)\)$/.exec(t)
  if (e) return (e[1] ?? '').split('|')[0] ?? "'…'"
  if (t === 'integer' || t === 'number' || t.startsWith('int')) return '1'
  if (t === 'boolean') return 'true'
  if (t.endsWith('[]')) return '[]'
  if (surface.models[t]) return '{ … }'
  const alias = surface.aliases?.[t]
  if (alias && alias.type !== t) return sampleFor(alias.type, surface)
  return "'…'"
}

/** The model names a rendered type mentions. */
function modelsIn(type: string | undefined, surface: ApiSurface): string[] {
  if (!type) return []
  const names = type.match(/[A-Za-z_$][\w$]*/g) ?? []
  return [...new Set(names.filter((n) => surface.models[n] !== undefined || surface.aliases?.[n] !== undefined))]
}

/** One operation: its typed signature, the models it names, and example calls. */
export function renderOperation(loaded: readonly LoadedSurface[], id: string): string {
  const hit = loaded.find((l) => l.surface.operations[id] !== undefined)
  if (!hit) {
    const all = loaded.flatMap((l) => Object.keys(l.surface.operations))
    const near = all.filter((n) => n.toLowerCase().includes(id.toLowerCase()) || id.toLowerCase().includes(n.toLowerCase())).slice(0, 8)
    return [
      `No operation \`${id}\` in the generated client.`,
      near.length > 0 ? `Did you mean: ${near.map((n) => `\`${n}\``).join(', ')}?` : 'Call `get_api_client()` for the list.',
    ].join('\n')
  }
  const { surface, base } = hit
  const op = surface.operations[id] as SurfaceOperation
  const inPath = pathParamNames(op.path)
  const params = Object.entries(op.params).map(([name, type]) => ({
    name,
    type,
    where: inPath.has(name) ? 'path' : 'query',
    required: op.requiredParams.includes(name),
  }))
  const lines: string[] = [`# \`${op.id}\` — ${op.method} ${op.path}`, '']
  if (op.summary) lines.push(op.summary, '')
  if (op.module) lines.push(`Endpoint in \`${base}/endpoints/${op.module}.ts\`; hooks in \`${base}/queries/${op.module}.ts\`.`, '')

  lines.push('## Input')
  if (params.length === 0 && !op.body) lines.push('- none')
  for (const p of params) lines.push(`- \`${p.name}\` (${p.where}${p.required ? ', required' : ''}): ${p.type}`)
  if (op.body) lines.push(`- body: ${op.body}`)
  lines.push('', '## Output')
  lines.push(`- response: ${op.response ?? 'none (no content)'}`)
  if (op.stream) lines.push(`- stream: ${op.stream} — one event per iteration`)
  lines.push('')

  const named = [...new Set([...modelsIn(op.response, surface), ...modelsIn(op.body, surface), ...modelsIn(op.stream, surface)])]
  if (named.length > 0) {
    lines.push('## Models it uses')
    for (const m of named) {
      const fields = surface.models[m]
      if (fields) {
        lines.push(`- \`${m}\` { ${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('; ')} }`)
      } else {
        lines.push(`- \`${m}\` = ${surface.aliases?.[m]?.type}`)
      }
    }
    lines.push('')
  }

  const pathArgs = params.filter((p) => p.where === 'path').map((p) => `${p.name}: ${sampleFor(p.type, surface)}`)
  const queryArgs = params.filter((p) => p.where === 'query' && p.required).map((p) => `${p.name}: ${sampleFor(p.type, surface)}`)
  const parts: string[] = []
  if (pathArgs.length > 0) parts.push(`params: { ${pathArgs.join(', ')} }`)
  if (queryArgs.length > 0) parts.push(`query: { ${queryArgs.join(', ')} }`)
  if (op.body) parts.push(`${op.body.startsWith('form') ? 'form' : op.body.startsWith('multipart') ? 'multipart' : op.body.startsWith('json') ? 'json' : 'body'}: { … }`)
  const args = parts.length > 0 ? `{ ${parts.join(', ')} }` : ''
  const mod = op.module ?? '<module>'
  lines.push('## Call it', '', '```ts')
  if (op.response !== undefined && !(op.stream && op.response === 'unknown')) {
    lines.push(`import { ${op.id} } from '${base}/endpoints/${mod}'`, '', `const result = await ${op.id}(${args})`, '')
  }
  const hook = hookOf(op)
  if (hook) {
    lines.push(`import { ${hook} } from '${base}/queries/${mod}'`, '')
    if (isQuery(op)) {
      lines.push(args ? `const q = ${hook}(() => (${args}))` : `const q = ${hook}()`, '// q.data() / q.isPending() / q.error() are signals — call them')
    } else {
      lines.push(`const m = ${hook}()`, `m.mutate(${args})`)
    }
    lines.push('')
  }
  const stream = op.symbols?.find((s) => s === `${op.id}Stream`)
  if (op.stream && stream) {
    lines.push(`import { ${stream} } from '${base}/endpoints/${mod}'`, '', `for await (const event of ${stream}(${args})) {`, '  // break closes the connection', '}')
    const streamHook = op.symbols?.find((s) => s === `use${stream.charAt(0).toUpperCase()}${stream.slice(1)}`)
    if (streamHook) {
      lines.push(
        '',
        `import { ${streamHook} } from '${base}/queries/${mod}'`,
        '',
        args ? `const live = ${streamHook}(() => (${args}))` : `const live = ${streamHook}()`,
        '// live.events() / live.latest() / live.status() are signals; the request closes on unmount',
      )
    }
  }
  lines.push('```')
  return lines.join('\n')
}

/**
 * What to go and check in the code, per change class. TOTAL over Lathe's
 * codes, so a new code fails the typecheck here until it says what it means.
 */
const ADVICE: Readonly<Record<SurfaceChange['code'], string>> = {
  'operation-removed': 'every call of the listed symbols must go — the endpoint no longer exists.',
  'operation-moved': 'the generated call follows the new method/path automatically; check any hand-written URL or cache key.',
  'param-now-required': 'every call must now pass this parameter — the typecheck will point at them after regenerating.',
  'param-type-changed': 'every value passed for this parameter must match the new type.',
  'body-changed': 'every request body built for this operation must match the new shape.',
  'response-changed': 'every reader of the result must handle the new shape.',
  'stream-removed': 'every `for await` / stream hook over this operation must go.',
  'stream-changed': 'every consumer of the streamed events must handle the new event type.',
  'model-removed': 'every use of the model (and the operations listed) must change.',
  'field-removed': 'every read of this field now yields `undefined` at runtime — search the listed operations\' consumers.',
  'field-type-changed': 'every read and write of this field must handle the new type.',
  'field-now-optional': 'the app reads it unconditionally today and it typechecks only because it never asks — guard every read.',
  'field-now-nullable': 'every read must handle `null` now.',
  'field-no-longer-nullable': 'any code sending `null` for this field is now rejected.',
  'model-type-changed': 'the model changed kind (object ↔ alias) — every use must be revisited.',
  'member-removed': 'code sending this enum/union member is now rejected.',
  'member-added': 'a `switch` over this value can now receive a member it does not handle.',
  'operation-added': 'nothing to fix — new surface.',
  'param-removed': 'nothing breaks; the server ignores it — drop it when convenient.',
  'param-added': 'nothing to fix — a new optional parameter.',
  'model-added': 'nothing to fix — a new model.',
  'field-added': 'nothing to fix — a new field.',
  'stream-added': 'nothing to fix — the operation can now be streamed.',
}

/** Markdown diff + a "what to check" line per breaking change. */
export function renderDiffExplanation(
  markdown: string,
  changes: readonly Pick<SurfaceChange, 'severity' | 'code' | 'subject'>[],
): string {
  const breaking = changes.filter((c) => c.severity === 'breaking')
  if (breaking.length === 0) return markdown
  const lines = [markdown.trimEnd(), '', '### What to check in the code', '']
  for (const c of breaking) lines.push(`- \`${c.subject}\` (\`${c.code}\`): ${ADVICE[c.code]}`)
  lines.push('', 'Severities are from the CLIENT\'s point of view: code that still typechecks after regenerating can be wrong at runtime.')
  return lines.join('\n')
}
