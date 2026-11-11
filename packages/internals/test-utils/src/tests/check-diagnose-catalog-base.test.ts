import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CATALOG_FILE, CATALOG_MARKER } from '../../../../../scripts/check-diagnose-catalog'

/**
 * The gate run for real, in a throwaway git repo, against the one input the
 * pure `evaluateGate` tests cannot model: WHICH commit the base count is read
 * from.
 *
 * A queued CI job fetches `origin/main` after the PR event froze its merge
 * ref. When `main` gained a catalog entry in between, reading the base at the
 * tip compared the PR against an entry it could not contain — 2026-11-10:
 * #4289 reported `base=123 → head=122`, and #4284's own new entry measured as
 * no growth. The base must be the merge-base, the same base the changed-file
 * diff already uses.
 */

const SCRIPT = resolve(import.meta.dirname, '..', '..', '..', '..', '..', 'scripts', 'check-diagnose-catalog.ts')

const roots: string[] = []
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

function catalog(ids: string[]): string {
  const entries = ids.map((id) => `  {\n    pattern: /${id}/,\n    diagnose: () => ({ cause: '${id}', fix: '${id}' }),\n  },`)
  return `${CATALOG_MARKER}\n${entries.join('\n')}\n]\n`
}

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'diagnose-gate-'))
  roots.push(root)
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t',
      },
    }).trim()
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  const commit = (message: string) => {
    git('add', '-A')
    git('commit', '-q', '-m', message)
    return git('rev-parse', 'HEAD')
  }
  git('init', '-q', '-b', 'main')
  return { root, git, write, commit }
}

function runGate(root: string) {
  const r = spawnSync('bun', [SCRIPT], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, BASE_REF: 'main', HEAD_REF: 'pr', HAS_SKIP_LABEL: 'false' },
  })
  return { status: r.status, out: `${r.stdout}${r.stderr}` }
}

/**
 * main@t0 has entries zza,zzb. The PR branches at t0 and adds a new
 * user-visible message to runtime-dom source that no entry matches, so the
 * gate falls through to the growth count; `withEntry` decides whether the PR
 * also adds entry `zzpr` (at the end). Then main moves to t1 by adding entry
 * `zzmain` (at the start, so the two additions do not conflict). No pattern
 * matches the message, so only the counts decide the verdict.
 */
function scenario(withEntry: boolean) {
  const r = repo()
  r.write(CATALOG_FILE, catalog(['zza', 'zzb']))
  r.write('packages/core/runtime-dom/src/x.ts', 'export const x = 1\n')
  const t0 = r.commit('base')
  r.git('checkout', '-q', '-b', 'pr')
  r.write('packages/core/runtime-dom/src/x.ts', "export const x = 1\nthrow new Error('[Pyreon] Boom.')\n")
  if (withEntry) r.write(CATALOG_FILE, catalog(['zza', 'zzb', 'zzpr']))
  const pr = r.commit('pr')
  r.git('checkout', '-q', 'main')
  r.write(CATALOG_FILE, catalog(['zzmain', 'zza', 'zzb']))
  const t1 = r.commit('main moves on')
  // What a fetch in the job sees: origin/main is the moved tip.
  r.git('update-ref', 'refs/remotes/origin/main', t1)
  return { ...r, t0, pr, t1 }
}

describe('check-diagnose-catalog measures growth from the merge-base', () => {
  it('passes a PR that adds an entry, run on its own branch after main gained one', () => {
    const s = scenario(true)
    s.git('checkout', '-q', 'pr')
    const r = runGate(s.root)
    expect(r.out).toContain('base=2 → head=3')
    expect(r.status).toBe(0)
  })

  it('passes it on a CI merge ref frozen before main moved (first parent = old main)', () => {
    const s = scenario(true)
    // refs/pull/N/merge as of the event: main@t0 merged with the PR head.
    const mergeRef = s.git('commit-tree', `${s.pr}^{tree}`, '-p', s.t0, '-p', s.pr, '-m', 'merge')
    s.git('checkout', '-q', '--detach', mergeRef)
    const r = runGate(s.root)
    expect(r.out).toContain('base=2 → head=3')
    expect(r.status).toBe(0)
  })

  it('still fails a PR that adds an uncatalogued message without adding an entry', () => {
    const s = scenario(false)
    s.git('checkout', '-q', 'pr')
    const r = runGate(s.root)
    expect(r.out).toContain('base=2 → head=2')
    expect(r.status).toBe(1)
  })
})
