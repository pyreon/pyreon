/**
 * The PreToolUse guard that blocks pushes to main.
 *
 * It used to decide by the branch checked out in the target repo. That was
 * wrong in both directions: `git push origin HEAD:main` from a feature branch
 * went through, and pushing some other branch (or deleting a remote branch)
 * from a checkout on main was refused. It now decides by the refspecs, and
 * falls back to the current branch only for a bare `git push`.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const GUARD = resolve(
  import.meta.dirname,
  '..', '..', '..', '..', '..',
  '.claude', 'scripts', 'guard-main-push.sh',
)

let onMain = ''
let onFeature = ''

function repo(branch: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'guard-main-push-'))
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')))
  execFileSync('git', ['-C', dir, 'init', '-q', '-b', branch], { env })
  // A real commit, so HEAD resolves the way it does in an actual checkout.
  execFileSync(
    'git',
    ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init'],
    { env },
  )
  return dir
}

beforeAll(() => {
  onMain = repo('main')
  onFeature = repo('feat/x')
})

/** Run the guard the way Claude Code does: hook JSON on stdin. */
function decide(command: string): 'block' | 'allow' {
  const out = execFileSync('bash', [GUARD], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  })
  return (JSON.parse(out) as { decision?: string }).decision === 'block' ? 'block' : 'allow'
}

describe('guard-main-push', () => {
  it('blocks an explicit refspec that writes main, from any branch', () => {
    expect(decide(`git -C ${onFeature} push origin main`)).toBe('block')
    expect(decide(`git -C ${onFeature} push origin HEAD:main`)).toBe('block')
    expect(decide(`git -C ${onFeature} push origin +feat/x:refs/heads/main`)).toBe('block')
    expect(decide(`git -C ${onFeature} push -f origin HEAD:master`)).toBe('block')
    expect(decide(`git -C ${onFeature} push origin --delete main`)).toBe('block')
    expect(decide(`cd ${onFeature} && git push -u origin HEAD:main`)).toBe('block')
  })

  it('blocks --all and --mirror, which can write main', () => {
    expect(decide(`git -C ${onFeature} push --all origin`)).toBe('block')
    expect(decide(`git -C ${onFeature} push --mirror origin`)).toBe('block')
  })

  it('blocks a bare push from a checkout on main', () => {
    expect(decide(`git -C ${onMain} push`)).toBe('block')
    expect(decide(`git -C ${onMain} push origin`)).toBe('block')
  })

  it('allows pushing another branch from a checkout on main', () => {
    // The false positive: deleting a remote branch, or publishing an archive
    // branch, from the primary checkout was refused.
    expect(decide(`git -C ${onMain} push origin feat/y`)).toBe('allow')
    expect(decide(`git -C ${onMain} push origin --delete old/branch`)).toBe('allow')
    expect(decide(`git -C ${onMain} push origin bench/x:refs/heads/archive/bench-x`)).toBe('allow')
  })

  it('allows ordinary feature-branch pushes', () => {
    expect(decide(`git -C ${onFeature} push`)).toBe('allow')
    expect(decide(`git -C ${onFeature} push -u origin feat/x`)).toBe('allow')
    expect(decide(`cd ${onFeature} && git push -u origin feat/x 2>&1 | tail -3`)).toBe('allow')
  })

  it('ignores commands that are not a push', () => {
    // Detection stays deliberately loose (it also matches `echo git push …`):
    // for a safety guard an over-block is cheaper than a missed push.
    expect(decide('git pull origin main')).toBe('allow')
    expect(decide('git fetch origin main')).toBe('allow')
  })
})
