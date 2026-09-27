/**
 * Map another generator's configuration onto a `lathe` section.
 *
 * Every option lands in exactly one of two lists: `mapped` (what it became)
 * or `unmapped` (why it did not, and what to do instead). Nothing is dropped
 * silently -- a migration that quietly loses an auth mutator is the migration
 * that 401s in production -- so an option this module has never heard of is
 * reported as unmapped rather than ignored.
 */

import type { LatheSection, PluginName } from '../../core/config'
import { prop, show, str, type Lit } from './literal'

export type SourceTool = 'orval' | 'hey-api' | 'kubb' | 'openapi-typescript' | 'spec'

export interface MappedOption {
  /** The option as the old tool spelled it (`output.client`). */
  from: string
  /** What it became (`plugins: queries`). */
  to: string
}

export interface UnmappedOption {
  from: string
  /** The value, as written. */
  value: string
  /** Why it has no Lathe equivalent, and what to do instead. */
  advice: string
}

export interface Migration {
  tool: SourceTool
  /** The API's name when the old config held several (orval's top-level keys). */
  name?: string | undefined
  /** The file the settings were read from, relative to the project. */
  file: string
  section: LatheSection
  mapped: MappedOption[]
  unmapped: UnmappedOption[]
}

/** The human name of a tool, for the report. */
export const TOOL_NAMES: Readonly<Record<SourceTool, string>> = {
  orval: 'orval',
  'hey-api': '@hey-api/openapi-ts',
  kubb: 'kubb',
  'openapi-typescript': 'openapi-typescript',
  spec: 'an OpenAPI document',
}

/** A spec location: a local path is `input`, a URL is `source` + a local `input`. */
function specLocation(value: string, out: Draft, from: string): void {
  if (/^https?:\/\//.test(value)) {
    const ext = /\.ya?ml(\?|#|$)/i.test(value) ? 'yaml' : 'json'
    out.section.source = value
    out.section.input = `./openapi.${ext}`
    out.mapped.push({ from, to: `source: '${value}' (lathe pull writes it to ./openapi.${ext})` })
  } else {
    out.section.input = value
    out.mapped.push({ from, to: `input: '${value}'` })
  }
}

interface Draft {
  section: LatheSection
  mapped: MappedOption[]
  unmapped: UnmappedOption[]
  plugins: Set<PluginName>
}

function draft(): Draft {
  return { section: {}, mapped: [], unmapped: [], plugins: new Set(['schemas', 'client']) }
}

function finish(tool: SourceTool, file: string, d: Draft): Migration {
  // Only set `plugins` when it differs from the default, so the written config
  // stays as short as the migration allows.
  const order: PluginName[] = ['types', 'schemas', 'client', 'queries', 'mocks', 'faker', 'components', 'atlas', 'docs']
  const plugins = order.filter((p) => d.plugins.has(p))
  const isDefault = plugins.join() === 'schemas,client,queries'
  const section: LatheSection = { ...d.section, ...(isDefault ? {} : { plugins }) }
  return { tool, file, section, mapped: d.mapped, unmapped: d.unmapped }
}

const unmapped = (d: Draft, from: string, value: Lit | string, advice: string): void => {
  d.unmapped.push({ from, value: typeof value === 'string' ? value : show(value), advice })
}

/** A path's directory: orval's `target` names a FILE, Lathe's `output` a directory. */
function dirOf(path: string): string {
  const clean = path.replace(/\/+$/, '')
  if (!/\.[cm]?[jt]sx?$/.test(clean)) return clean
  const i = clean.lastIndexOf('/')
  return i <= 0 ? '.' : clean.slice(0, i)
}

const QUERY_CLIENTS = new Set(['react-query', 'vue-query', 'svelte-query', 'solid-query', 'swr', 'angular-query'])

// ─── orval ───────────────────────────────────────────────────────────────────

/**
 * orval: one config object per API (`{ petstore: { input, output } }`), so
 * several entries become `projects`.
 */
export function fromOrval(config: Lit, file: string): Migration[] {
  if (config.kind !== 'object') return []
  const entries = config.entries.filter(([k]) => k !== '...')
  const out: Migration[] = []
  for (const [name, project] of entries) {
    const d = draft()
    if (project.kind !== 'object') {
      unmapped(d, name, project, 'not an object literal Lathe can read; configure this API by hand')
      out.push(finish('orval', file, d))
      continue
    }
    const input = prop(project, 'input')
    if (input?.kind === 'string') specLocation(input.value, d, `${name}.input`)
    else if (input?.kind === 'object') {
      const target = str(prop(input, 'target'))
      if (target) specLocation(target, d, `${name}.input.target`)
      for (const [k, v] of input.entries) {
        if (k === 'target') continue
        unmapped(d, `${name}.input.${k}`, v, k === 'filters'
          ? 'Lathe generates every operation; filter the spec before generating (e.g. a `redocly bundle --remove-unused-components` step).'
          : k === 'override'
            ? 'spec transforms are not supported; patch the spec file instead.'
            : 'no Lathe equivalent.')
      }
    } else if (input) unmapped(d, `${name}.input`, input, 'set `input` by hand.')

    const output = prop(project, 'output')
    let explicitClient = false
    if (output?.kind === 'string') {
      d.section.output = dirOf(output.value)
      d.mapped.push({ from: `${name}.output`, to: `output: '${d.section.output}'` })
    } else if (output?.kind === 'object') {
      for (const [k, v] of output.entries) {
        const at = `${name}.output.${k}`
        switch (k) {
          case 'target': {
            const s = str(v)
            if (s) {
              d.section.output = dirOf(s)
              d.mapped.push({ from: at, to: `output: '${d.section.output}' (Lathe writes a directory)` })
            } else unmapped(d, at, v, 'set `output` by hand.')
            break
          }
          case 'client': {
            const s = str(v)
            if (s && QUERY_CLIENTS.has(s)) {
              d.plugins.add('queries')
              d.mapped.push({ from: at, to: `plugins: queries (${s} hooks become @pyreon/query hooks)` })
            } else if (s === 'axios' || s === 'axios-functions') {
              d.section.client = 'axios'
              explicitClient = true
              d.mapped.push({ from: at, to: "client: 'axios'" })
            } else if (s === 'fetch') {
              d.section.client = 'fetch'
              explicitClient = true
              d.mapped.push({ from: at, to: "client: 'fetch'" })
            } else if (s === 'zod') {
              d.section.validator = 'zod'
              d.mapped.push({ from: at, to: "validator: 'zod' (schemas are emitted with every client)" })
            } else unmapped(d, at, v, 'no Lathe equivalent for this client; Lathe emits @pyreon/http endpoints and @pyreon/query hooks.')
            break
          }
          case 'httpClient': {
            const s = str(v)
            if (s === 'axios' || s === 'fetch') {
              d.section.client = s
              explicitClient = true
              d.mapped.push({ from: at, to: `client: '${s}'` })
            } else unmapped(d, at, v, 'Lathe clients: pyreon, fetch, axios, ky.')
            break
          }
          case 'mock': {
            if (v.kind === 'boolean' ? v.value : v.kind === 'object') {
              d.plugins.add('mocks').add('faker')
              d.mapped.push({ from: at, to: 'plugins: mocks, faker (installMocks() replaces the MSW handlers)' })
              if (v.kind === 'object') {
                for (const [mk, mv] of v.entries) {
                  if (mk !== 'type') unmapped(d, `${at}.${mk}`, mv, 'fixture tuning is not configurable; override one operation in a test with `mockOperation(id, { json })`.')
                }
              }
            }
            break
          }
          case 'baseUrl': {
            const s = str(v)
            if (s) {
              d.section.baseUrl = s
              d.mapped.push({ from: at, to: `baseUrl: '${s}'` })
            } else unmapped(d, at, v, 'a computed base URL belongs at runtime: `configureApi({ baseUrl })`.')
            break
          }
          case 'mode':
            d.mapped.push({ from: at, to: 'one module per tag (Lathe always splits by tag; nothing to set)' })
            break
          case 'schemas':
            d.mapped.push({ from: at, to: 'schemas are written to `<output>/schemas/` (not configurable)' })
            break
          case 'clean':
            d.mapped.push({ from: at, to: 'Lathe removes files it stopped generating (lathe-manifest.json); nothing to set' })
            break
          case 'override': {
            if (v.kind !== 'object') {
              unmapped(d, at, v, 'no Lathe equivalent.')
              break
            }
            for (const [ok, ov] of v.entries) {
              unmapped(d, `${at}.${ok}`, ov, ok === 'mutator'
                ? 'a custom fetch instance becomes middleware: `configureApi({ use: [yourMiddleware], headers })` — see the migration guide.'
                : ok === 'query'
                  ? 'query options are per call: pass them as the hook\'s second accessor, `useX(args, () => ({ staleTime }))`.'
                  : 'no Lathe equivalent.')
            }
            break
          }
          default:
            unmapped(d, at, v, k === 'prettier' || k === 'biome'
              ? 'Lathe has no formatter hook; run your formatter over the output directory in the same script.'
              : 'no Lathe equivalent.')
        }
      }
    } else if (output) unmapped(d, `${name}.output`, output, 'set `output` by hand.')
    if (!explicitClient) {
      d.mapped.push({
        from: `${name}.output.httpClient`,
        to: "client: 'pyreon' (orval's default was axios; set client: 'axios' to keep it)",
      })
    }
    for (const [k, v] of project.entries) {
      if (k === 'input' || k === 'output') continue
      unmapped(d, `${name}.${k}`, v, k === 'hooks'
        ? 'Lathe has no lifecycle hooks; chain the command after `lathe generate` in the package.json script.'
        : 'no Lathe equivalent.')
    }
    out.push({ ...finish('orval', file, d), name })
  }
  return out
}

// ─── @hey-api/openapi-ts ─────────────────────────────────────────────────────

export function fromHeyApi(config: Lit, file: string): Migration[] {
  const d = draft()
  if (config.kind !== 'object') return []
  for (const [k, v] of config.entries) {
    switch (k) {
      case 'input': {
        const s = str(v) ?? str(prop(v, 'path'))
        if (s) specLocation(s, d, k === 'input' && v.kind === 'string' ? 'input' : 'input.path')
        else unmapped(d, 'input', v, 'set `input` by hand.')
        break
      }
      case 'output': {
        const s = str(v) ?? str(prop(v, 'path'))
        if (s) {
          d.section.output = s
          d.mapped.push({ from: v.kind === 'string' ? 'output' : 'output.path', to: `output: '${s}'` })
        }
        if (v.kind === 'object') {
          for (const [ok, ov] of v.entries) {
            if (ok === 'path') continue
            unmapped(d, `output.${ok}`, ov, ok === 'format' || ok === 'lint'
              ? 'Lathe has no formatter hook; run your formatter over the output directory in the same script.'
              : 'no Lathe equivalent.')
          }
        }
        break
      }
      case 'client':
        heyPlugin(d, v, 'client')
        break
      case 'plugins':
        if (v.kind === 'array') v.items.forEach((item, i) => heyPlugin(d, item, `plugins[${i}]`))
        else unmapped(d, 'plugins', v, 'list the Lathe plugins by hand.')
        break
      default:
        unmapped(d, k, v, 'no Lathe equivalent.')
    }
  }
  return [finish('hey-api', file, d)]
}

function heyPlugin(d: Draft, item: Lit, at: string): void {
  const name = str(item) ?? str(prop(item, 'name'))
  if (!name) {
    unmapped(d, at, item, 'not a plugin name Lathe can read.')
    return
  }
  switch (name) {
    case '@hey-api/client-fetch':
    case '@hey-api/client-next':
    case '@hey-api/client-nuxt':
      d.mapped.push({ from: at, to: "client: 'pyreon' (fetch-based, and the only client that reaches iOS/Android)" })
      return
    case '@hey-api/client-axios':
      d.section.client = 'axios'
      d.mapped.push({ from: at, to: "client: 'axios'" })
      return
    case '@hey-api/client-ky':
      d.section.client = 'ky'
      d.mapped.push({ from: at, to: "client: 'ky'" })
      return
    case '@hey-api/typescript':
    case '@hey-api/schemas':
      d.mapped.push({ from: at, to: 'plugins: schemas (types and runtime schemas together)' })
      return
    case '@hey-api/sdk':
      d.mapped.push({ from: at, to: 'plugins: client (one endpoint per operation)' })
      return
    case 'zod':
      d.section.validator = 'zod'
      d.mapped.push({ from: at, to: "validator: 'zod'" })
      return
    case 'valibot':
      d.mapped.push({ from: at, to: "validator: 'pyreon' (Lathe emits @pyreon/validate or zod; valibot is not an option)" })
      return
    default:
      if (/^@tanstack\/(react|vue|svelte|solid|angular)-query$/.test(name)) {
        d.plugins.add('queries')
        d.mapped.push({ from: at, to: `plugins: queries (${name} hooks become @pyreon/query hooks)` })
        return
      }
      unmapped(d, at, item, 'no Lathe equivalent for this plugin.')
  }
}

// ─── kubb ────────────────────────────────────────────────────────────────────

export function fromKubb(config: Lit, file: string): Migration[] {
  const d = draft()
  if (config.kind !== 'object') return []
  const root = str(prop(config, 'root'))
  const under = (p: string): string => (root && root !== '.' && !/^https?:|^\//.test(p) ? `${root.replace(/\/+$/, '')}/${p.replace(/^\.\//, '')}` : p)
  let clientSeen = false
  for (const [k, v] of config.entries) {
    switch (k) {
      case 'root':
        break
      case 'input': {
        const s = str(prop(v, 'path')) ?? str(v)
        if (s) specLocation(under(s), d, 'input.path')
        else unmapped(d, 'input', v, 'set `input` by hand.')
        break
      }
      case 'output': {
        const s = str(prop(v, 'path'))
        if (s) {
          d.section.output = under(s)
          d.mapped.push({ from: 'output.path', to: `output: '${d.section.output}'` })
        }
        if (v.kind === 'object') {
          for (const [ok, ov] of v.entries) {
            if (ok === 'path') continue
            if (ok === 'clean') d.mapped.push({ from: 'output.clean', to: 'Lathe removes files it stopped generating; nothing to set' })
            else unmapped(d, `output.${ok}`, ov, 'no Lathe equivalent.')
          }
        }
        break
      }
      case 'plugins':
        if (v.kind === 'array') {
          v.items.forEach((item, i) => {
            if (kubbPlugin(d, item, `plugins[${i}]`)) clientSeen = true
          })
        } else unmapped(d, 'plugins', v, 'list the Lathe plugins by hand.')
        break
      default:
        unmapped(d, k, v, k === 'hooks' ? 'chain the command after `lathe generate` in the package.json script.' : 'no Lathe equivalent.')
    }
  }
  if (!clientSeen) d.plugins.delete('client')
  return [finish('kubb', file, d)]
}

/** Map one kubb plugin call. Returns whether it was a CLIENT plugin. */
function kubbPlugin(d: Draft, item: Lit, at: string): boolean {
  if (item.kind !== 'call') {
    unmapped(d, at, item, 'not a plugin call Lathe can read.')
    return false
  }
  const opts = item.args[0]
  const name = item.callee
  switch (name) {
    case 'pluginOas':
      d.mapped.push({ from: `${at} ${name}`, to: 'built in (Lathe reads the spec itself)' })
      return false
    case 'pluginTs':
      d.mapped.push({ from: `${at} ${name}`, to: 'plugins: schemas (types come with the schemas)' })
      return false
    case 'pluginClient': {
      const client = str(prop(opts, 'client')) ?? str(prop(opts, 'importPath'))
      if (client === 'fetch') {
        d.section.client = 'fetch'
        d.mapped.push({ from: `${at} ${name}({ client: 'fetch' })`, to: "client: 'fetch'" })
      } else if (client === 'axios') {
        d.section.client = 'axios'
        d.mapped.push({ from: `${at} ${name}({ client: 'axios' })`, to: "client: 'axios'" })
      } else {
        d.mapped.push({ from: `${at} ${name}`, to: "client: 'pyreon' (kubb's default was axios; set client: 'axios' to keep it)" })
      }
      const base = str(prop(opts, 'baseURL'))
      if (base) {
        d.section.baseUrl = base
        d.mapped.push({ from: `${at} ${name}({ baseURL })`, to: `baseUrl: '${base}'` })
      }
      d.plugins.add('client')
      reportOptions(d, `${at} ${name}`, opts, ['client', 'importPath', 'baseURL', 'output'])
      return true
    }
    case 'pluginReactQuery':
    case 'pluginVueQuery':
    case 'pluginSvelteQuery':
    case 'pluginSolidQuery':
    case 'pluginTanstackQuery':
    case 'pluginSwr':
      d.plugins.add('client').add('queries')
      d.mapped.push({ from: `${at} ${name}`, to: 'plugins: queries (@pyreon/query hooks)' })
      reportOptions(d, `${at} ${name}`, opts, ['output'])
      return true
    case 'pluginZod':
      d.section.validator = 'zod'
      d.mapped.push({ from: `${at} ${name}`, to: "validator: 'zod'" })
      return false
    case 'pluginFaker':
      d.plugins.add('faker')
      d.mapped.push({ from: `${at} ${name}`, to: 'plugins: faker (createX() factories)' })
      return false
    case 'pluginMsw':
      d.plugins.add('mocks')
      d.mapped.push({ from: `${at} ${name}`, to: 'plugins: mocks (installMocks() replaces the MSW handlers)' })
      return false
    case 'pluginRedoc':
      d.plugins.add('docs')
      d.mapped.push({ from: `${at} ${name}`, to: 'plugins: docs (Markdown reference pages)' })
      return false
    default:
      unmapped(d, `${at} ${name}`, item, 'no Lathe equivalent for this plugin.')
      return false
  }
}

/** Report the options of a plugin call that were not consumed (`output` paths are Lathe's own layout). */
function reportOptions(d: Draft, at: string, opts: Lit | undefined, consumed: readonly string[]): void {
  if (opts?.kind !== 'object') return
  for (const [k, v] of opts.entries) {
    if (consumed.includes(k)) continue
    unmapped(d, `${at}.${k}`, v, 'no Lathe equivalent.')
  }
}

// ─── openapi-typescript (+ openapi-fetch / openapi-react-query) ─────────────

/**
 * openapi-typescript is configured on its COMMAND LINE, so the input is the
 * `openapi-typescript <spec> -o <file>` script. The companion packages decide
 * the plugins: `openapi-fetch` means a client was wanted, `openapi-react-query`
 * hooks.
 */
export function fromOpenapiTypescript(
  script: { name: string; command: string },
  deps: ReadonlySet<string>,
  file: string,
): Migration[] {
  const d = draft()
  const argv = script.command.trim().split(/\s+/)
  const at = argv.findIndex((a) => /(^|\/)openapi-typescript$/.test(a))
  const args = argv.slice(at + 1)
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (a === '-o' || a === '--output') {
      const o = args[++i]
      if (o) {
        d.section.output = dirOf(o)
        d.mapped.push({ from: `${script.name}: ${a} ${o}`, to: `output: '${d.section.output}'` })
      }
    } else if (!a.startsWith('-') && d.section.input === undefined && d.section.source === undefined) {
      specLocation(a, d, `${script.name}: ${a}`)
    } else if (a.startsWith('-')) {
      unmapped(d, `${script.name}: ${a}`, a, 'no Lathe equivalent; the generated types follow the spec exactly.')
    }
  }
  if (deps.has('openapi-react-query')) {
    d.plugins.add('queries')
    d.mapped.push({ from: 'openapi-react-query', to: 'plugins: queries (typed @pyreon/query hooks per operation)' })
  }
  if (deps.has('openapi-fetch')) {
    d.mapped.push({ from: 'openapi-fetch', to: "client: 'pyreon' (one typed endpoint per operation instead of client.GET(path))" })
  }
  if (!deps.has('openapi-fetch') && !deps.has('openapi-react-query')) {
    d.plugins.delete('client')
    d.mapped.push({ from: 'openapi-typescript', to: 'plugins: schemas (types plus runtime schemas)' })
  }
  return [finish('openapi-typescript', file, d)]
}

/** A bare spec: nothing to map but the path. */
export function fromSpec(path: string): Migration[] {
  const d = draft()
  d.plugins.add('queries')
  specLocation(path, d, path)
  return [finish('spec', path, d)]
}
