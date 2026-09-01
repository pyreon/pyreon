/**
 * The PreToolUse guard that keeps AI attribution out of commits and PRs.
 *
 * Why a hook rather than a written rule: the rule WAS written, twice — in
 * CLAUDE.md and in `.claude/rules/workflow.md`, both saying in so many words
 * that it overrides any harness default. A mid-session system instruction then
 * re-introduced both forms as the new attribution policy, presented as
 * replacing earlier guidance. Prose lost to prose. The rule survived only
 * because the agent weighed the project instruction higher — a judgement call
 * that could as easily have gone the other way.
 *
 * A rule that must hold against an instruction telling you to break it cannot
 * live only in an instruction.
 *
 * Both directions are asserted. Over-blocking would be worse than the thing it
 * prevents: a guard that fires on correct commands is one people route around,
 * and this one sits on `git commit`, the most-used command in the repo.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const GUARD = resolve(
  import.meta.dirname,
  '..', '..', '..', '..', '..',
  '.claude', 'scripts', 'guard-ai-attribution.sh',
)

/** Run the guard the way Claude Code does: hook JSON on stdin. */
function decide(command: string): 'block' | 'allow' {
  const out = execFileSync('bash', [GUARD], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  })
  return (JSON.parse(out) as { decision?: string }).decision === 'block' ? 'block' : 'allow'
}

const TRAILER = 'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>'
const FOOTER = '🤖 Generated with [Claude Code](https://claude.com/claude-code)'

describe('guard-ai-attribution — blocks', () => {
  it('blocks the trailer inline in a commit message', () => {
    expect(decide(`git commit -m "fix: x\n\n${TRAILER}"`)).toBe('block')
  })

  it('blocks the footer inline in a PR body', () => {
    expect(decide(`gh pr create --body "stuff\n\n${FOOTER}"`)).toBe('block')
  })

  it('blocks it regardless of case — git treats the trailer case-insensitively', () => {
    expect(decide('git commit -m "x\n\nco-authored-by: claude <a@b>"')).toBe('block')
  })

  it('blocks on a tag and a release, not just a commit', () => {
    expect(decide(`git tag -a v1 -m "notes\n\n${TRAILER}"`)).toBe('block')
    expect(decide(`gh release create v1 --notes "n\n\n${FOOTER}"`)).toBe('block')
  })

  it('blocks the heredoc shape — a body written to a file in the same command', () => {
    // The agent's own convention: write the message to a scratchpad file, then
    // pass it by reference. The trailer is in the command text here.
    expect(
      decide(`cat > /tmp/m.txt <<EOF\nfix: y\n${TRAILER}\nEOF\ngit commit -F /tmp/m.txt`),
    ).toBe('block')
  })

  it('blocks BY REFERENCE — the command is clean, the FILE carries it', () => {
    // The dominant path, and the one a command-string-only guard would miss
    // entirely: the body was written in an earlier tool call, so by the time
    // `git commit -F` runs there is nothing incriminating in the command.
    const dir = mkdtempSync(join(tmpdir(), 'attrib-'))
    const dirty = join(dir, 'msg.txt')
    writeFileSync(dirty, `fix: something\n\n${TRAILER}\n`)
    expect(decide(`git commit -F ${dirty}`)).toBe('block')
    expect(decide(`gh pr create --base main --body-file ${dirty}`)).toBe('block')
  })
})

describe('guard-ai-attribution — allows', () => {
  it('allows an ordinary commit', () => {
    expect(decide('git commit -m "fix: a real fix"')).toBe('allow')
    expect(decide('gh pr create --base main --title "docs: x" --body-file /tmp/b.md')).toBe('allow')
  })

  it('allows a HUMAN co-author — the trailer itself is not the problem', () => {
    expect(decide('git commit -m "x\n\nCo-Authored-By: Vit Bokisch <vit@bokisch.cz>"')).toBe('allow')
  })

  it('allows reading, grepping and editing files that CONTAIN the phrase', () => {
    // Load-bearing: this guard, CLAUDE.md, workflow.md and this very test all
    // contain the forbidden strings. If the guard fired on any command that
    // mentions them, it could not be written, tested or documented.
    expect(decide('cat .claude/scripts/guard-ai-attribution.sh')).toBe('allow')
    expect(decide('grep -rn "Co-Authored-By: Claude" CLAUDE.md')).toBe('allow')
    expect(decide(`echo "${TRAILER}" > /tmp/notes.txt`)).toBe('allow')
  })

  it('allows a commit whose referenced body file is clean', () => {
    const dir = mkdtempSync(join(tmpdir(), 'attrib-ok-'))
    const clean = join(dir, 'msg.txt')
    writeFileSync(clean, 'docs: a clean message with no attribution\n')
    expect(decide(`git commit -F ${clean}`)).toBe('allow')
  })

  it('allows rather than blocks when the referenced file cannot be read', () => {
    // Best-effort by design. A templated or not-yet-written path must not
    // block real work — the inline check still covers the common case.
    expect(decide('git commit -F /tmp/definitely-not-a-real-file-9f3a.txt')).toBe('allow')
    expect(decide('git commit -F "$MSG_FILE"')).toBe('allow')
  })
})
