import { renderApiReferenceEntries, renderLlmsTxtLine } from '@pyreon/manifest'
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
      `"- @pyreon/validate — Pyreon's own validation library — chainable + function-comp hybrid API, Standard Schema-native, with built-in field metadata, reactive parse, and i18n-aware error formatting. The protocol deliberately omits a metadata channel — that's the gap \`withField\` fills. The protocol also doesn't carry i18n keys — \`formatErrors\` adds that layer."`,
    )
  })

  it('has all 26 v1 API entries', () => {
    expect(manifest.api).toHaveLength(26)
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
      'toJsonSchema',
      'serverCheck',
      'registerServerCheck',
      'catch',
      'readonly',
      'array',
      'or',
      'and',
      'pipe',
      'superRefine',
      'preprocess',
      'nonoptional',
      'stringbool',
      'never',
      'custom',
      'instanceof',
      'nativeEnum',
    ])
  })

  it('every API entry has summary + example', () => {
    for (const entry of manifest.api) {
      expect(entry.summary, `${entry.name} missing summary`).toBeTruthy()
      expect(entry.example, `${entry.name} missing example`).toBeTruthy()
    }
  })

  it('renders the MCP api-reference region (spot-checked, not full-body — MCP prose rots inline snapshots)', () => {
    const rendered = renderApiReferenceEntries(manifest)
    // one entry per api[] item, keyed validate/<name>
    expect(Object.keys(rendered)).toHaveLength(manifest.api.length)
    for (const key of Object.keys(rendered)) expect(key).toMatch(/^validate\//)
    expect(rendered['validate/toJsonSchema']).toBeDefined()
    expect(rendered['validate/withField']).toBeDefined()
    expect(rendered['validate/serverCheck']).toBeDefined()
    // notes carry the summary; the mistakes catalog renders on `mistakes`
    expect(rendered['validate/toJsonSchema']!.notes).toContain('draft 2020-12')
    expect(rendered['validate/toJsonSchema']!.mistakes).toContain('unrepresentable')
  })
})
