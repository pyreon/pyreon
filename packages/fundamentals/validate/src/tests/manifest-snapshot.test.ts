import { renderLlmsTxtLine } from '@pyreon/manifest'
import { describe, expect, it } from 'vitest'
import manifest from '../manifest'

/**
 * Locks the rendered `llms.txt` bullet so unintentional manifest edits
 * are surfaced as test failures. Run `bun run test -- -u` to update
 * intentionally.
 *
 * The `llms-full.txt` section is NOT snapshotted inline — it embeds the
 * full longExample and would balloon the test file. The CI `Docs Sync`
 * job catches drift against the generated `llms-full.txt`.
 */
describe('gen-docs — validate snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(
      `"- @pyreon/validate — Pyreon-flavoured layer on top of Standard Schema — field metadata, reactive parse, i18n-aware error formatting. The protocol deliberately omits a metadata channel — that's the gap \`withField\` fills. The protocol also doesn't carry i18n keys — \`formatErrors\` adds that layer."`,
    )
  })

  it('has all 9 v1 API entries', () => {
    expect(manifest.api).toHaveLength(9)
    const names = manifest.api.map((a) => a.name)
    expect(names).toEqual([
      'withField',
      'getMeta',
      'resolveMetaField',
      'parseReactive',
      'parseReactiveAsync',
      'watchValid',
      'formatError',
      'formatErrors',
      'formatErrorsByPath',
    ])
  })

  it('every API entry has summary + example', () => {
    for (const entry of manifest.api) {
      expect(entry.summary, `${entry.name} missing summary`).toBeTruthy()
      expect(entry.example, `${entry.name} missing example`).toBeTruthy()
    }
  })
})
