import type { ZeroConfig } from './types'

type UserKeys = keyof Omit<ZeroConfig, '_autoMode'>

/**
 * Every key `zero({...})` accepts. `satisfies` makes this TOTAL over the
 * config type: adding a field to `ZeroConfig` without listing it here (or
 * listing a key that does not exist) is a type error, so the runtime check
 * can never drift from the type.
 */
const ZERO_CONFIG_KEYS = {
  mode: true,
  typedRoutes: true,
  entryClient: true,
  ssr: true,
  buildSummary: true,
  perfAdvisor: true,
  env: true,
  routeRules: true,
  ssg: true,
  isr: true,
  adapter: true,
  base: true,
  i18n: true,
  middleware: true,
  port: true,
  image: true,
  font: true,
  seo: true,
  favicon: true,
  theme: true,
  og: true,
  ai: true,
} as const satisfies Record<UserKeys, true>

const MODES = ['ssr', 'ssg', 'spa', 'isr', 'auto'] as const
const ADAPTERS = ['node', 'bun', 'static', 'vercel', 'cloudflare', 'netlify'] as const
const SSR_MODES = ['string', 'stream'] as const

/** Levenshtein distance, bounded to short identifiers (config keys). */
function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]!
}

/** Closest candidate within an edit distance that reads as a typo. */
export function didYouMean(input: string, candidates: readonly string[]): string | undefined {
  const lower = input.toLowerCase()
  let best: string | undefined
  let bestScore = Number.POSITIVE_INFINITY
  for (const c of candidates) {
    const score = c.toLowerCase() === lower ? 0 : distance(lower, c.toLowerCase())
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  return bestScore <= Math.max(2, Math.floor(input.length / 3)) ? best : undefined
}

function hint(input: string, candidates: readonly string[]): string {
  const guess = didYouMean(input, candidates)
  return guess ? ` Did you mean "${guess}"?` : ''
}

function checkEnum(
  field: string,
  value: unknown,
  allowed: readonly string[],
  problems: string[],
): void {
  if (value === undefined) return
  if (typeof value !== 'string' || !allowed.includes(value)) {
    problems.push(
      `\`${field}\` must be one of ${allowed.map((a) => `'${a}'`).join(' | ')} — got ${JSON.stringify(value)}.${
        typeof value === 'string' ? hint(value, allowed) : ''
      }`,
    )
  }
}

/**
 * Validate the object passed to `zero({...})`. An unknown key is a typo that
 * would otherwise be silently ignored (the setting just never takes effect),
 * and a bad enum value reaches deep into the build before failing, if it
 * fails at all. Both throw ONE `[Pyreon]` error listing every problem.
 */
export function validateZeroConfig(input: unknown): void {
  if (input === undefined) return
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`[Pyreon] zero() expects a config object — got ${input === null ? 'null' : typeof input}.`)
  }
  const cfg = input as Record<string, unknown>
  const problems: string[] = []
  const known = Object.keys(ZERO_CONFIG_KEYS)
  for (const key of Object.keys(cfg)) {
    if (key === '_autoMode') continue
    if (!(key in ZERO_CONFIG_KEYS)) {
      problems.push(`unknown option \`${key}\`.${hint(key, known)}`)
    }
  }
  checkEnum('mode', cfg.mode, MODES, problems)
  if (typeof cfg.adapter === 'string') checkEnum('adapter', cfg.adapter, ADAPTERS, problems)
  else if (cfg.adapter !== undefined && (cfg.adapter === null || typeof cfg.adapter !== 'object')) {
    problems.push(`\`adapter\` must be an adapter name or an Adapter object — got ${JSON.stringify(cfg.adapter)}.`)
  }
  const ssr = cfg.ssr
  if (ssr !== undefined && ssr !== null && typeof ssr === 'object') {
    checkEnum('ssr.mode', (ssr as Record<string, unknown>).mode, SSR_MODES, problems)
  }
  if (cfg.base !== undefined && typeof cfg.base !== 'string') {
    problems.push(`\`base\` must be a string (e.g. "/docs/") — got ${JSON.stringify(cfg.base)}.`)
  }
  if (
    cfg.port !== undefined &&
    (typeof cfg.port !== 'number' || !Number.isInteger(cfg.port) || cfg.port < 0 || cfg.port > 65535)
  ) {
    problems.push(`\`port\` must be an integer 0–65535 — got ${JSON.stringify(cfg.port)}.`)
  }
  if (problems.length > 0) {
    throw new Error(
      `[Pyreon] Invalid zero() config:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    )
  }
}
