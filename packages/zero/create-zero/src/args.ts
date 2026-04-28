import type { AdapterId, AiToolId, IntegrationId, RenderMode, TemplateId } from './templates'

/**
 * Parsed CLI arguments. Every field is optional — fields with a value
 * short-circuit the corresponding prompt in `runPrompts`. The arg parser
 * is intentionally lightweight (no `commander` / `yargs`) since the flag
 * surface is small and stable.
 */
export interface CliArgs {
  /** Positional project name (first non-flag arg). */
  name: string | undefined
  /** Skip every prompt that has a usable default. */
  yes: boolean
  /** Print --help and exit. Resolved by the entry point, not stored here. */
  help: boolean

  template: TemplateId | undefined
  adapter: AdapterId | undefined
  mode: RenderMode | undefined
  features: string[] | undefined
  integrations: IntegrationId[] | undefined
  ai: AiToolId[] | undefined
  compat: 'none' | 'react' | 'vue' | 'solid' | 'preact' | undefined
  packageStrategy: 'meta' | 'individual' | undefined
  lint: boolean | undefined
}

const TEMPLATE_VALUES: TemplateId[] = ['app', 'blog', 'dashboard']
const ADAPTER_VALUES: AdapterId[] = [
  'vercel',
  'cloudflare',
  'netlify',
  'node',
  'bun',
  'static',
]
const MODE_VALUES: RenderMode[] = ['ssr-stream', 'ssr-string', 'ssg', 'spa']
const INTEGRATION_VALUES: IntegrationId[] = ['supabase', 'email']
const AI_VALUES: AiToolId[] = ['mcp', 'claude', 'cursor', 'copilot', 'agents']
type CompatId = 'none' | 'react' | 'vue' | 'solid' | 'preact'
type PackageStrategy = 'meta' | 'individual'

const COMPAT_VALUES: CompatId[] = ['none', 'react', 'vue', 'solid', 'preact']
const PKG_STRATEGY_VALUES: PackageStrategy[] = ['meta', 'individual']

export function parseArgs(argv: readonly string[]): CliArgs {
  const out: CliArgs = {
    name: undefined,
    yes: false,
    help: false,
    template: undefined,
    adapter: undefined,
    mode: undefined,
    features: undefined,
    integrations: undefined,
    ai: undefined,
    compat: undefined,
    packageStrategy: undefined,
    lint: undefined,
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === undefined) continue

    // Flags: `--flag value`, `--flag=value`, or boolean `--flag` / `--no-flag`
    if (a.startsWith('--') || a === '-h') {
      const eq = a.indexOf('=')
      const key = eq >= 0 ? a.slice(2, eq) : a.startsWith('--') ? a.slice(2) : 'h'
      const inlineValue = eq >= 0 ? a.slice(eq + 1) : undefined

      const consumeValue = (): string | undefined => {
        if (inlineValue !== undefined) return inlineValue
        const next = argv[i + 1]
        if (next === undefined || next.startsWith('--')) return undefined
        i++
        return next
      }

      switch (key) {
        case 'help':
        case 'h':
          out.help = true
          break
        case 'yes':
          out.yes = true
          break
        case 'lint':
          out.lint = true
          break
        case 'no-lint':
          out.lint = false
          break
        case 'template':
          out.template = pickEnum(consumeValue(), TEMPLATE_VALUES, '--template')
          break
        case 'adapter':
          out.adapter = pickEnum(consumeValue(), ADAPTER_VALUES, '--adapter')
          break
        case 'mode':
          out.mode = pickEnum(consumeValue(), MODE_VALUES, '--mode')
          break
        case 'features':
          out.features = parseCsv(consumeValue())
          break
        case 'integrations':
          out.integrations = parseEnumCsv(
            consumeValue(),
            INTEGRATION_VALUES,
            '--integrations',
          )
          break
        case 'ai':
          out.ai = parseEnumCsv(consumeValue(), AI_VALUES, '--ai')
          break
        case 'compat':
          out.compat = pickEnum(consumeValue(), COMPAT_VALUES, '--compat')
          break
        case 'pm':
        case 'packages':
        case 'package-strategy':
          out.packageStrategy = pickEnum(
            consumeValue(),
            PKG_STRATEGY_VALUES,
            '--packages',
          )
          break
        default:
          throw new Error(`Unknown flag: ${a}. Run with --help for usage.`)
      }
      continue
    }

    // Positional: first non-flag is the project name. Subsequent positionals
    // are an error — keep the surface obvious.
    if (out.name === undefined) {
      out.name = a
    } else {
      throw new Error(`Unexpected extra positional argument: ${a}`)
    }
  }

  return out
}

function parseCsv(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseEnumCsv<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  flag: string,
): T[] | undefined {
  const parts = parseCsv(raw)
  if (parts === undefined) return undefined
  for (const p of parts) {
    if (!(allowed as readonly string[]).includes(p)) {
      throw new Error(
        `Invalid value "${p}" for ${flag}. Expected one of: ${allowed.join(', ')}.`,
      )
    }
  }
  return parts as T[]
}

function pickEnum<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  flag: string,
): T | undefined {
  if (raw === undefined) return undefined
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new Error(
      `Invalid value "${raw}" for ${flag}. Expected one of: ${allowed.join(', ')}.`,
    )
  }
  return raw as T
}

export function helpText(invokedAs: string): string {
  return `Usage: ${invokedAs} [name] [flags]

Scaffold a new Pyreon Zero project.

Templates:
  --template <id>          app | blog | dashboard

Deployment:
  --adapter <id>           vercel | cloudflare | netlify | node | bun | static

Rendering:
  --mode <id>              ssr-stream | ssr-string | ssg | spa

Features (csv):
  --features <list>        store,query,forms,table,virtual,i18n,charts,…
  --integrations <list>    supabase,email
  --ai <list>              mcp,claude,cursor,copilot,agents

Other:
  --compat <id>            none | react | vue | solid | preact
  --packages <id>          meta | individual
  --lint / --no-lint       toggle @pyreon/lint
  --yes                    skip prompts, accept defaults
  --help, -h               show this help

Examples:
  ${invokedAs} my-app
  ${invokedAs} my-app --template dashboard --adapter vercel --integrations supabase,email --yes
  ${invokedAs} my-blog --template blog --adapter cloudflare --yes
`
}
