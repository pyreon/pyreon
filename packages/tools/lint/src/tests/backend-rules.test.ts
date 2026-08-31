import { describe, expect, it } from 'vitest'
import { groupOf } from '../rules/groups'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

/**
 * The `backend` group — rules that only make sense once a file is known to
 * serve requests.
 *
 * The whole group turns on a question no AST-local linter can answer: is this
 * a REQUEST PATH? A synchronous `readFileSync` is correct at module scope and
 * a latent outage inside a handler, and the difference is not visible in the
 * call itself. That is why these are role-gated to `server` rather than
 * shipped as general rules, and why the tests below are careful to assert the
 * NEGATIVE cases — boot-time reads, non-server files — as hard as the
 * positive ones. A backend rule that fires at module scope would be
 * unusable.
 *
 * Shipped with only fires-invariant fixtures; `no-floating-promise-in-handler`
 * sat at 67% branches and `no-sync-fs-in-request-path` at 71%.
 */

const cfg = {
  rules: {
    'pyreon/no-sync-fs-in-request-path': 'warn',
    'pyreon/no-floating-promise-in-handler': 'warn',
  },
} as never

/** An fs-router api route — the shape `isApiRouteFile` recognises. */
const API = 'src/routes/api/items.ts'

const at = (src: string, file: string) => lintFile(file, src, allRules, cfg).diagnostics
const only = (src: string, id: string, file = API) =>
  at(src, file).filter((d) => d.ruleId === id)

describe('backend group wiring', () => {
  it('holds exactly the request-path rules, and every one is server-gated', () => {
    const be = allRules.filter((r) => groupOf(r.meta) === 'backend')
    expect(be.map((r) => r.meta.id).sort()).toEqual([
      'pyreon/no-floating-promise-in-handler',
      'pyreon/no-sync-fs-in-request-path',
    ])
    for (const r of be) expect(r.meta.appliesTo, r.meta.id).toEqual(['server'])
  })
})

describe('pyreon/no-sync-fs-in-request-path', () => {
  const ID = 'pyreon/no-sync-fs-in-request-path'

  it('fires inside an exported handler', () => {
    const d = only(
      `import { readFileSync } from 'node:fs'\nexport function GET() { return readFileSync('./a.json', 'utf8') }`,
      ID,
    )
    expect(d).toHaveLength(1)
    expect(d[0]?.message).toContain('readFileSync')
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'loader', 'action', 'onRequest'])(
    'covers the %s entry point too',
    (name) => {
      const decl =
        name === 'loader' || name === 'action' || name === 'onRequest'
          ? `export const ${name} = () => { return statSync('./a') }`
          : `export function ${name}() { return statSync('./a') }`
      expect(only(`import { statSync } from 'node:fs'\n${decl}`, ID)).toHaveLength(1)
    },
  )

  it('does NOT fire at module scope — boot-time reads are the correct pattern', () => {
    // This is the case that decides whether the rule is usable at all. Config
    // loaded once at import time is exactly how you avoid the per-request
    // cost, so flagging it would push people toward the bug.
    expect(
      only(
        `import { readFileSync } from 'node:fs'\nconst config = JSON.parse(readFileSync('./c.json', 'utf8'))\nexport function GET() { return config }`,
        ID,
      ),
    ).toEqual([])
  })

  it('still fires under a components/ path — a node: import PROVES the role', () => {
    // The resolver reads the module graph before it reads conventions: a file
    // importing `node:fs` is server code wherever it sits. Asserting the
    // opposite here was this test's own first mistake, and the rule was
    // right. Path-based gating alone would have missed this file.
    expect(
      only(
        `import { readFileSync } from 'node:fs'\nexport function GET() { return readFileSync('./a', 'utf8') }`,
        ID,
        'src/components/Widget.tsx',
      ),
    ).toHaveLength(1)
  })

  it('does NOT fire in a file with no server proof at all', () => {
    // No node: import, no api-route path — `shared`, so a server-gated rule
    // must stay out of it.
    expect(
      only(
        `export function GET() { return readFileSync('./a', 'utf8') }`,
        ID,
        'src/components/Widget.tsx',
      ),
    ).toEqual([])
  })

  it('flags the blocking child_process calls, not just fs', () => {
    expect(
      only(
        `import { execSync } from 'node:child_process'\nexport function POST() { return execSync('ls') }`,
        ID,
      ),
    ).toHaveLength(1)
  })

  it('stays silent on the async counterpart — the fix', () => {
    expect(
      only(
        `import { readFile } from 'node:fs/promises'\nexport async function GET() { return await readFile('./a', 'utf8') }`,
        ID,
      ),
    ).toEqual([])
  })
})

describe('pyreon/no-floating-promise-in-handler', () => {
  const ID = 'pyreon/no-floating-promise-in-handler'

  it('fires on a dropped async call inside a handler', () => {
    const d = only(
      `export async function POST() { sendEmail(); return new Response('ok') }`,
      ID,
    )
    expect(d.length).toBeGreaterThan(0)
  })

  it('stays silent when the promise is awaited', () => {
    expect(
      only(`export async function POST() { await sendEmail(); return new Response('ok') }`, ID),
    ).toEqual([])
  })

  it('stays silent when the rejection is explicitly handled', () => {
    // Deliberate fire-and-forget with a catch is a real pattern — the defect
    // is the DROPPED failure, not the un-awaited call.
    expect(
      only(
        `export async function POST() { sendEmail().catch(log); return new Response('ok') }`,
        ID,
      ),
    ).toEqual([])
  })

  it('recognises a method call, not just a bare function', () => {
    // `mailer.sendEmail()` is the far more common shape in real handlers.
    expect(
      only(`export async function POST() { mailer.sendEmail(); return new Response('ok') }`, ID)
        .length,
    ).toBeGreaterThan(0)
  })

  it('recognises a handler exported as a const arrow', () => {
    // fs-router accepts `export const POST = () => …` as readily as a
    // function declaration; a rule that only matched declarations would miss
    // half the codebases it runs on.
    expect(
      only(`export const POST = async () => { sendEmail(); return new Response('ok') }`, ID).length,
    ).toBeGreaterThan(0)
  })

  it('ignores a call whose name carries no async signal', () => {
    expect(
      only(`export async function POST() { formatRow(); return new Response('ok') }`, ID),
    ).toEqual([])
  })

  it('does NOT fire in a non-server file', () => {
    expect(
      only(
        `export async function POST() { sendEmail(); return new Response('ok') }`,
        ID,
        'src/components/Widget.tsx',
      ),
    ).toEqual([])
  })
})
