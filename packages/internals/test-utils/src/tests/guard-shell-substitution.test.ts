/**
 * The PreToolUse guard that blocks command substitution landing inside a
 * message/body argument.
 *
 * Why this is worth a test rather than trusting the script: the mistake it
 * prevents is one the repo had ALREADY written down (CLAUDE.md: "backticks in
 * `-m` execute") and which recurred anyway, silently — the shell drops the
 * text and the command still exits 0. A guard against a silent failure is
 * itself worthless if it silently stops matching.
 *
 * Both directions are asserted. Over-blocking would be worse than the original
 * bug, because a guard that fires on correct commands is one people learn to
 * work around.
 */
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const GUARD = resolve(
  import.meta.dirname,
  '..', '..', '..', '..', '..',
  '.claude', 'scripts', 'guard-shell-substitution.sh',
)

/** Run the guard the way Claude Code does: hook JSON on stdin. */
function decide(command: string): 'block' | 'allow' {
  const out = execFileSync('bash', [GUARD], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  })
  return (JSON.parse(out) as { decision?: string }).decision === 'block' ? 'block' : 'allow'
}

describe('guard-shell-substitution', () => {
  it('blocks a backtick inside a double-quoted body — the shape that actually shipped', () => {
    // This is the literal command that corrupted a PR comment: the backticked
    // spans were executed and the posted text lost them.
    expect(decide('gh pr comment 2958 --body "the `foo` helper is wrong"')).toBe('block')
    expect(decide('git commit -m "fix: `bar` was undefined"')).toBe('block')
    expect(decide('gh pr create --title "x" --body "see `baz`"')).toBe('block')
  })

  it('allows the RECOMMENDED forms, or the guard teaches nothing', () => {
    expect(decide('gh pr comment 2958 --body-file /tmp/body.md')).toBe('allow')
    expect(decide('git commit -F /tmp/msg.txt')).toBe('allow')
  })

  it('allows single quotes, which suppress substitution', () => {
    // Flagging these would be a false positive: nothing is executed.
    expect(decide("gh pr comment 1 --body 'the `foo` helper is wrong'")).toBe('allow')
    expect(decide(`gh pr comment 1 --body 'say "hi" to \`x\``)).toBe('allow')
  })

  it('allows $(...), which is nearly always intentional', () => {
    // `-f body="$(cat notes.md)"` is the fix this guard recommends. Blocking it
    // would train people to ignore the guard.
    expect(decide('gh api -X PATCH repos/o/r/issues/comments/1 -f body="$(cat /tmp/b.md)"')).toBe('allow')
  })

  it('allows an explicitly escaped backtick', () => {
    expect(decide('git commit -m "a \\` b"')).toBe('allow')
  })

  it('stays out of the way when no message flag is involved', () => {
    // A deliberate `X="`date`"` elsewhere is archaic, not this mistake.
    expect(decide('X="`date`"; echo $X')).toBe('allow')
    expect(decide('echo hello')).toBe('allow')
  })
})
