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

describe('guard-ai-attribution — line-start anchoring', () => {
  // The first cut matched anywhere in the text, and so blocked any commit whose
  // message merely DISCUSSED the rule — including the commits that add and
  // document this hook. The guard refused to let itself be maintained, which is
  // the one false positive it can least afford: it makes correcting the policy
  // harder than violating it.
  //
  // A git trailer is by definition a Token: value pair at the START of a line,
  // and GitHub renders the footer the same way. Anchoring therefore costs no
  // real coverage; the block-side specs above still pass unchanged.

  it('allows a commit message that mentions the forms mid-line', () => {
    expect(
      decide('git commit -m "docs: explain that a Co-Authored-By: Claude trailer is banned"'),
    ).toBe('allow')
  })

  it('allows a body FILE that documents the rule in prose', () => {
    // The self-block, reproduced. This PR's own commit body says exactly this.
    const dir = mkdtempSync(join(tmpdir(), 'attrib-prose-'))
    const prose = join(dir, 'msg.txt')
    writeFileSync(
      prose,
      [
        'chore: make the no-attribution rule a control',
        '',
        'The guard blocks a Co-Authored-By: Claude trailer, and it also',
        'rejects the Generated with [Claude Code] footer. Both are banned.',
        '',
      ].join('\n'),
    )
    expect(decide(`git commit -F ${prose}`)).toBe('allow')
  })

  it('KNOWN EDGE — prose that BEGINS a line with the phrase is still blocked', () => {
    // The discriminator is position, so prose is safe only while it does not
    // start a line with one of the forms. That is the deliberate trade: the
    // alternative is matching mid-line, which is what made the guard unable to
    // document itself. An author who hits this rewraps the sentence.
    const dir = mkdtempSync(join(tmpdir(), 'attrib-edge-'))
    const wrapped = join(dir, 'msg.txt')
    writeFileSync(wrapped, 'docs: x\n\nThe rule forbids a\nCo-Authored-By: Claude trailer.\n')
    expect(decide(`git commit -F ${wrapped}`)).toBe('block')
  })

  it('still blocks a real trailer that FOLLOWS prose about the rule', () => {
    // The discriminator is position, not vocabulary: the same file may discuss
    // the rule and still be rejected for carrying the trailer itself.
    const dir = mkdtempSync(join(tmpdir(), 'attrib-both-'))
    const both = join(dir, 'msg.txt')
    writeFileSync(both, `chore: x\n\nA Co-Authored-By: Claude trailer is banned.\n\n${TRAILER}\n`)
    expect(decide(`git commit -F ${both}`)).toBe('block')
  })

  it('normalizes an escaped newline so an inline -m trailer is still caught', () => {
    // A -m argument carries its line break as a two-character backslash-n
    // sequence, so a naive line-start anchor would never fire on the inline
    // shape. Covered by the block specs above; asserted here as the reason the
    // unescape step exists.
    expect(decide(`git commit -m "fix: x\n\n${TRAILER}"`)).toBe('block')
  })
})
