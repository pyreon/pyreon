/**
 * Injection-class regression locks for the chat renderers (audit fix).
 *
 * google-chat interpolated user text UNESCAPED into its HTML-ish card
 * markup (`<b>${text}</b>`), so a literal `<` in content corrupted the
 * card — the exact injection shape telegram already escaped against.
 * Same family, lower stakes: whatsapp/slack/teams didn't escape their
 * markup metachars (`*`, `_`, `~`), so user text containing them silently
 * toggled formatting.
 *
 * These specs exist because the fixes initially shipped WITHOUT failing
 * coverage (reverting the renderer changed no test result) — per the
 * "a test that passes against the broken state is not load-bearing" rule.
 */
import { describe, expect, it } from 'vitest'
import { Document, Page, Text } from '../nodes'
import { render } from '../render'

const doc = (content: string) =>
  Document({
    title: 'esc',
    children: [Page({ children: [Text({ children: [content] })] })],
  })

describe('chat renderers escape user text (injection class)', () => {
  it('google-chat: literal < > & in user text are XML-escaped, not raw', async () => {
    const out = (await render(doc('a < b & c > d'), 'google-chat' as never)) as string
    expect(out).not.toMatch(/a < b & c > d/)
    expect(out).toContain('a &lt; b &amp; c &gt; d')
  })

  it('google-chat: a crafted </text> style payload cannot break out of the card markup', async () => {
    const out = (await render(doc('x<b>bold-injection</b>y'), 'google-chat' as never)) as string
    expect(out, 'tag chars from USER TEXT must be entity-escaped').not.toContain(
      '<b>bold-injection</b>',
    )
    expect(out).toContain('&lt;b&gt;bold-injection&lt;/b&gt;')
  })

  it('slack: the REAL mrkdwn injection vectors are entity-escaped (<!channel> ping, <url|label> fake link)', async () => {
    // Slack's API contract: & < > MUST be entity-encoded in mrkdwn text —
    // without it `<!channel>` pings the whole channel and
    // `<https://evil|login>` injects a fake link. The formatting toggles
    // (* _ ~) have NO escape syntax in mrkdwn — a documented platform
    // limitation, deliberately NOT "fixed" with zero-width-char hacks.
    const out = JSON.stringify(await render(doc('ping <!channel> now'), 'slack' as never))
    expect(out).not.toContain('<!channel>')
    expect(out).toContain('&lt;!channel&gt;')
  })

  it('teams: user text with markup chars round-trips inside VALID Adaptive Card JSON', async () => {
    const raw = (await render(doc('a < b & c'), 'teams' as never)) as string
    // The output must stay structurally valid JSON with the user's literal
    // text intact — user content can never corrupt the card structure.
    const card = JSON.parse(raw) as Record<string, unknown>
    expect(JSON.stringify(card)).toContain('a < b & c')
  })
})
