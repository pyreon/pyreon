/**
 * Tests for the three HTTP-adjacent best-practice rules:
 *   - pyreon/query-fn-must-forward-signal      (dep-gated @pyreon/query)
 *   - pyreon/no-unencoded-path-interpolation   (dep-gated @pyreon/http)
 *   - pyreon/no-untimed-raw-fetch              (dep-gated @pyreon/http)
 *
 * Paired FIRES / DOES-NOT-FIRE specs throughout. The DOES-NOT-FIRE half
 * carries the weight here: all three rules match on method NAMES, so the
 * risk is false positives, and a rule that cries wolf gets switched off —
 * which is strictly worse than not shipping it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { noUnencodedPathInterpolation } from '../rules/http/no-unencoded-path-interpolation'
import { noUntimedRawFetch } from '../rules/http/no-untimed-raw-fetch'
import { queryFnMustForwardSignal } from '../rules/query/query-fn-must-forward-signal'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'
import { _resetProjectDepsCache } from '../utils/project-deps'

const RULES = [queryFnMustForwardSignal, noUnencodedPathInterpolation, noUntimedRawFetch]

const CONFIG: LintConfig = {
  rules: {
    'pyreon/query-fn-must-forward-signal': 'warn',
    'pyreon/no-unencoded-path-interpolation': 'warn',
    'pyreon/no-untimed-raw-fetch': 'info',
  },
}

let projectDir: string

/** A project whose package.json declares the given deps. */
function makeProject(deps: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-http-lint-'))
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'app', dependencies: deps }),
  )
  return dir
}

function lint(source: string, config: LintConfig = CONFIG): string[] {
  const file = join(projectDir, 'src', 'app.ts')
  writeFileSync(file, source)
  return lintFile(file, source, RULES, config).diagnostics.map((d) => d.ruleId)
}

beforeEach(() => {
  _resetProjectDepsCache()
  projectDir = makeProject({
    '@pyreon/query': '^0.50.0',
    '@pyreon/http': '^0.50.0',
  })
})

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true })
  _resetProjectDepsCache()
})

describe('pyreon/query-fn-must-forward-signal', () => {
  it('FIRES on a zero-arg queryFn that fetches', () => {
    expect(
      lint(`
        const q = useQuery(() => ({
          queryKey: ['users'],
          queryFn: () => fetch('/api/users').then((r) => r.json()),
        }))
      `),
    ).toContain('pyreon/query-fn-must-forward-signal')
  })

  it('FIRES on the exact shape @pyreon/feature ships today', () => {
    // `queryFn: () => http.getById(api, id)` — the live bug this rule exists for.
    expect(
      lint(`
        const q = useQuery(() => ({
          queryKey: ['item', id],
          queryFn: () => http.getById(api, id),
        }))
      `),
    ).toContain('pyreon/query-fn-must-forward-signal')
  })

  it('FIRES through an ALIASED import — the shape @pyreon/feature actually uses', () => {
    // `import { useQuery as _useQuery }` then `_useQuery(...)`. Matching
    // only the literal identifier makes the rule blind to the exact file
    // it was written for; verified against the real source, where it now
    // reports all three dead-cancellation sites.
    expect(
      lint(`
        import { useQuery as _useQuery } from '@pyreon/query'
        const q = _useQuery(() => ({
          queryKey: ['item', id],
          queryFn: () => http.getById(api, id),
        }))
      `),
    ).toContain('pyreon/query-fn-must-forward-signal')
  })

  it('does NOT treat an unrelated alias as a query hook', () => {
    expect(
      lint(`
        import { somethingElse as useQueryish } from './local'
        const q = useQueryish(() => ({ queryFn: () => api.get('/x') }))
      `),
    ).not.toContain('pyreon/query-fn-must-forward-signal')
  })

  it('FIRES with a plain object literal options argument too', () => {
    expect(
      lint(`
        const q = useSuspenseQuery({
          queryKey: ['users'],
          queryFn: () => api.get('/users'),
        })
      `),
    ).toContain('pyreon/query-fn-must-forward-signal')
  })

  it('FIRES through a block-bodied options thunk', () => {
    expect(
      lint(`
        const q = useQuery(() => {
          return { queryKey: ['users'], queryFn: async () => { await api.get('/users') } }
        })
      `),
    ).toContain('pyreon/query-fn-must-forward-signal')
  })

  it('does NOT fire when the signal is destructured and forwarded', () => {
    expect(
      lint(`
        const q = useQuery(() => ({
          queryKey: ['users'],
          queryFn: ({ signal }) => fetch('/api/users', { signal }),
        }))
      `),
    ).not.toContain('pyreon/query-fn-must-forward-signal')
  })

  it('does NOT fire when the destructured signal is RENAMED', () => {
    // `signal` appears only in the PARAMETER pattern here. Body-only
    // scanning reports this correct code as a violation — found when
    // `@pyreon/feature` renamed the binding to avoid shadowing `signal`
    // from `@pyreon/reactivity`.
    expect(
      lint(`
        const q = useQuery(() => ({
          queryKey: ['users'],
          queryFn: ({ signal: abortSignal }) => api.get('/users', { signal: abortSignal }),
        }))
      `),
    ).not.toContain('pyreon/query-fn-must-forward-signal')
  })

  it('does NOT fire when the signal is reached through the context param', async () => {
    expect(
      lint(`
        const q = useQuery(() => ({
          queryKey: ['users'],
          queryFn: (ctx) => api.get('/users', { signal: ctx.signal }),
        }))
      `),
    ).not.toContain('pyreon/query-fn-must-forward-signal')
  })

  it('does NOT fire on a queryFn that performs no request', () => {
    // Nothing to cancel — flagging this would be pure noise.
    expect(
      lint(`
        const q = useQuery(() => ({
          queryKey: ['local'],
          queryFn: () => computeFromCache(items),
        }))
      `),
    ).not.toContain('pyreon/query-fn-must-forward-signal')
  })

  it('does NOT fire when queryFn is an identifier with no visible body', () => {
    expect(
      lint(`
        const q = useQuery(() => ({ queryKey: ['users'], queryFn: fetchUsers }))
      `),
    ).not.toContain('pyreon/query-fn-must-forward-signal')
  })

  it('does NOT fire on endpoint.query() — the signal is wired for you', () => {
    expect(
      lint(`const q = useQuery(() => getUser.query({ params: { id: id() } }))`),
    ).not.toContain('pyreon/query-fn-must-forward-signal')
  })

  it('does NOT fire on useMutation — mutations get no signal from TanStack', () => {
    expect(
      lint(`
        const m = useMutation({ mutationFn: (v) => api.post('/users', { json: v }) })
      `),
    ).not.toContain('pyreon/query-fn-must-forward-signal')
  })

  it('does NOT fire when @pyreon/query is absent from package.json', () => {
    rmSync(projectDir, { recursive: true, force: true })
    _resetProjectDepsCache()
    projectDir = makeProject({ '@pyreon/http': '^0.50.0' })

    expect(
      lint(`
        const q = useQuery(() => ({ queryKey: ['u'], queryFn: () => fetch('/u') }))
      `),
    ).not.toContain('pyreon/query-fn-must-forward-signal')
  })
})

describe('pyreon/no-unencoded-path-interpolation', () => {
  it('FIRES on an interpolated path', () => {
    expect(lint('await api.get(`/users/${id}`)')).toContain(
      'pyreon/no-unencoded-path-interpolation',
    )
  })

  it('FIRES for every request method', () => {
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']) {
      expect(lint(`await api.${method}(\`/users/\${id}\`)`)).toContain(
        'pyreon/no-unencoded-path-interpolation',
      )
    }
  })

  it('FIRES on request(), where the path is the SECOND argument', () => {
    expect(lint("await api.request('GET', `/users/${id}`)")).toContain(
      'pyreon/no-unencoded-path-interpolation',
    )
  })

  it('does NOT fire on request() when only the METHOD position is a template', () => {
    expect(lint('await api.request(`GET`, "/users")')).not.toContain(
      'pyreon/no-unencoded-path-interpolation',
    )
  })

  it('does NOT fire on a template literal with no interpolation', () => {
    expect(lint('await api.get(`/users`)')).not.toContain(
      'pyreon/no-unencoded-path-interpolation',
    )
  })

  it('does NOT fire on the safe params form', () => {
    expect(lint("await api.get('/users/:id', { params: { id } })")).not.toContain(
      'pyreon/no-unencoded-path-interpolation',
    )
  })

  it('does NOT fire on a non-request method name', () => {
    expect(lint('const x = logger.debug(`/users/${id}`)')).not.toContain(
      'pyreon/no-unencoded-path-interpolation',
    )
  })

  it('does NOT fire when @pyreon/http is absent', () => {
    rmSync(projectDir, { recursive: true, force: true })
    _resetProjectDepsCache()
    projectDir = makeProject({ '@pyreon/query': '^0.50.0' })

    expect(lint('await api.get(`/users/${id}`)')).not.toContain(
      'pyreon/no-unencoded-path-interpolation',
    )
  })
})

describe('pyreon/no-untimed-raw-fetch', () => {
  it('FIRES on a bare fetch with no init', () => {
    expect(lint("await fetch('/api/users')")).toContain('pyreon/no-untimed-raw-fetch')
  })

  it('FIRES on a fetch whose init carries no signal', () => {
    expect(lint("await fetch('/api/users', { method: 'POST' })")).toContain(
      'pyreon/no-untimed-raw-fetch',
    )
  })

  it('does NOT fire when a signal is passed', () => {
    expect(lint("await fetch('/api/users', { signal })")).not.toContain(
      'pyreon/no-untimed-raw-fetch',
    )
    expect(lint("await fetch('/u', { signal: AbortSignal.timeout(5000) })")).not.toContain(
      'pyreon/no-untimed-raw-fetch',
    )
  })

  it('does NOT fire when init is spread or opaque — it may carry a signal', () => {
    expect(lint("await fetch('/u', { ...init })")).not.toContain('pyreon/no-untimed-raw-fetch')
    expect(lint("await fetch('/u', buildInit())")).not.toContain('pyreon/no-untimed-raw-fetch')
    expect(lint("await fetch('/u', init)")).not.toContain('pyreon/no-untimed-raw-fetch')
  })

  it('does NOT fire on a client call, which already has a deadline', () => {
    expect(lint("await api.get('/users')")).not.toContain('pyreon/no-untimed-raw-fetch')
  })

  it('does NOT fire when @pyreon/http is absent', () => {
    rmSync(projectDir, { recursive: true, force: true })
    _resetProjectDepsCache()
    projectDir = makeProject({})

    expect(lint("await fetch('/api/users')")).not.toContain('pyreon/no-untimed-raw-fetch')
  })
})

describe('exemptPaths', () => {
  it('honours the exemption option', () => {
    const exempt: LintConfig = {
      rules: {
        'pyreon/no-untimed-raw-fetch': ['info', { exemptPaths: ['src/'] }],
      },
    }
    expect(lint("await fetch('/api/users')", exempt)).not.toContain(
      'pyreon/no-untimed-raw-fetch',
    )
  })
})
