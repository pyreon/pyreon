import { describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

/**
 * The five backend rules that completed the tier.
 *
 * Every one of them turns on a question no AST-local linter can answer — is
 * this a REQUEST PATH? — and the measurement that shaped them is worth
 * recording: `no-await-in-loop-over-io` first shipped gated on
 * `appliesTo: ['server']` alone and reported 15 findings against this repo,
 * every single one an SSG plugin, template engine or scanner. Server-role is
 * not the same as request-serving, and the difference is the whole rule.
 */

const cfg = {
  rules: {
    'pyreon/no-unvalidated-request-body': 'warn',
    'pyreon/no-await-in-loop-over-io': 'warn',
    'pyreon/require-request-signal-forwarding': 'warn',
    'pyreon/no-module-mutable-in-handler': 'error',
    'pyreon/no-secret-in-shared-module': 'error',
  },
} as never

const API = 'src/routes/api/items.ts'
const only = (src: string, id: string, file = API) =>
  lintFile(file, src, allRules, cfg).diagnostics.filter((d) => d.ruleId === id)

describe('pyreon/no-unvalidated-request-body', () => {
  const ID = 'pyreon/no-unvalidated-request-body'

  it('fires on a body read into a binding with no validation in the function', () => {
    expect(
      only(`export async function POST(req: Request) { const b = await req.json()\n  return save(b) }`, ID),
    ).toHaveLength(1)
  })

  it('stays silent when the body is parsed', () => {
    expect(
      only(
        `export async function POST(req: Request) { const b = schema.parse(await req.json())\n  return save(b) }`,
        ID,
      ),
    ).toEqual([])
  })

  it('accepts any validating call, not one library', () => {
    // The rule must not encode a single validator: a project may use its own
    // `assertOrder(...)`, and telling it to adopt ours would be overreach.
    for (const call of ['validate', 'assert', 'decode', 'safeParse']) {
      expect(
        only(
          `export async function POST(req: Request) { const b = ${call}(await req.json())\n  return save(b) }`,
          ID,
        ),
        call,
      ).toEqual([])
    }
  })

  it('covers formData and text, not just json', () => {
    expect(
      only(`export async function POST(req: Request) { const b = await req.formData()\n  return save(b) }`, ID),
    ).toHaveLength(1)
  })

  it('does not fire outside a server file', () => {
    expect(
      only(
        `export async function POST(req: Request) { const b = await req.json()\n  return save(b) }`,
        ID,
        'src/components/W.tsx',
      ),
    ).toEqual([])
  })
})

describe('pyreon/no-await-in-loop-over-io', () => {
  const ID = 'pyreon/no-await-in-loop-over-io'

  it('fires inside a handler', () => {
    expect(
      only(
        `export async function GET(req: Request) { const o = []\n  for (const id of ids) { o.push(await fetchOne(id)) }\n  return o }`,
        ID,
      ),
    ).toHaveLength(1)
  })

  it('stays silent on Promise.all — the fix', () => {
    expect(
      only(`export async function GET(req: Request) { return await Promise.all(ids.map(fetchOne)) }`, ID),
    ).toEqual([])
  })

  it('does NOT fire in build tooling, which is server-role but serves nothing', () => {
    // The correction that made this rule usable. Without the handler gate it
    // reported 15 findings here, all of them sequential-on-purpose build code.
    expect(
      only(
        `export async function buildAll() { for (const p of pages) { await renderOne(p) } }`,
        ID,
        'src/ssg-plugin.ts',
      ),
    ).toEqual([])
  })

  it('ignores an await inside a nested callback — different schedule', () => {
    expect(
      only(
        `export async function GET(req: Request) { for (const id of ids) { queue(async () => { await fetchOne(id) }) } }`,
        ID,
      ),
    ).toEqual([])
  })

  it('ignores an await on something that is not I/O-shaped', () => {
    expect(
      only(`export async function GET(req: Request) { for (const x of xs) { await tick(x) } }`, ID),
    ).toEqual([])
  })
})

describe('pyreon/require-request-signal-forwarding', () => {
  const ID = 'pyreon/require-request-signal-forwarding'

  it('fires on an outbound fetch with no options at all', () => {
    expect(only(`export async function GET(req: Request) { return fetch('https://x.dev') }`, ID)).toHaveLength(1)
  })

  it('stays silent once the signal is forwarded', () => {
    expect(
      only(`export async function GET(req: Request) { return fetch('https://x.dev', { signal: req.signal }) }`, ID),
    ).toEqual([])
  })

  it('stays silent when options are spread — it cannot see inside', () => {
    expect(
      only(`export async function GET(req: Request) { return fetch('https://x.dev', { ...opts }) }`, ID),
    ).toEqual([])
  })

  it('does not fire when there is no request in scope to forward', () => {
    // A fetch in a module with no inbound request has nothing to forward, and
    // demanding a signal there would be nonsense.
    expect(only(`export async function warm() { return fetch('https://x.dev') }`, ID)).toEqual([])
  })
})

describe('pyreon/no-module-mutable-in-handler', () => {
  const ID = 'pyreon/no-module-mutable-in-handler'

  it('fires on request state written to a module-level let', () => {
    expect(
      only(`let current = null\nexport function GET(req: Request) { current = req.url\n  return current }`, ID),
    ).toHaveLength(1)
  })

  it('stays silent on a local', () => {
    expect(
      only(`export function GET(req: Request) { const current = req.url\n  return current }`, ID),
    ).toEqual([])
  })

  it('stays silent on a module-level const that is only read', () => {
    // Boot-time config shared across requests is the CORRECT pattern, and
    // flagging it would push people away from it.
    expect(
      only(`const config = load()\nexport function GET(req: Request) { return config.value }`, ID),
    ).toEqual([])
  })

  it('does not fire outside a handler', () => {
    expect(only(`let cache = null\nexport function warm() { cache = compute() }`, ID)).toEqual([])
  })
})

describe('pyreon/no-secret-in-shared-module', () => {
  const ID = 'pyreon/no-secret-in-shared-module'
  const SHARED = 'src/config.ts'

  it('fires on a non-public env read', () => {
    expect(only(`export const k = process.env.STRIPE_SECRET_KEY`, ID, SHARED)).toHaveLength(1)
  })

  it('stays silent on a ZERO_PUBLIC_ value — the sanctioned crossing', () => {
    expect(only(`export const u = process.env.ZERO_PUBLIC_API_URL`, ID, SHARED)).toEqual([])
  })

  it.each(['NODE_ENV', 'CI', 'FORCE_COLOR', 'NO_COLOR', 'TERM', 'DEBUG'])(
    'treats %s as environment plumbing, not a secret',
    (name) => {
      // FORCE_COLOR is here because the rule reported it three times in
      // `@pyreon/ansi` on its first run — a TTY capability check, not a
      // credential. The benign list earns entries by measurement.
      expect(only(`export const v = process.env.${name}`, ID, SHARED)).toEqual([])
    },
  )

  it('reads a computed key when it is a literal', () => {
    expect(only(`export const k = process.env['DATABASE_URL']`, ID, SHARED)).toHaveLength(1)
  })
})
