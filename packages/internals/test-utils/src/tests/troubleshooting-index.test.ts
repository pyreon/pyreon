// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderTroubleshootingIndex } from '../../../../../docs/scripts/troubleshooting-index'
import { parseAntiPatterns, type AntiPatternEntry } from '../../../../tools/mcp/src/anti-patterns'

function catalog(reactivity: string[], jsx: string[]) {
  const entries = parseAntiPatterns(
    `## Reactivity Mistakes\n${['Base signal', ...reactivity].map((name) => `- **${name}**: Read signals reactively.`).join('\n')}\n## JSX Mistakes\n${['Base child', ...jsx].map((name) => `- **${name}**: Preserve reactive children.`).join('\n')}`,
  )
  expect(entries).toHaveLength(2 + reactivity.length + jsx.length)
  const categories = new Map<string, { heading: string; items: AntiPatternEntry[] }>()
  for (const entry of entries) {
    const category = categories.get(entry.category) ?? { heading: entry.categoryHeading, items: [] }
    category.items.push(entry)
    categories.set(entry.category, category)
  }
  return renderTroubleshootingIndex(categories)
}

describe('troubleshooting navigation merges', () => {
  it.each([true, false])(
    'merges independent additions and stays fresh (same category: %s)',
    (same) => {
      const root = mkdtempSync(join(tmpdir(), 'pyreon-troubleshooting-merge-'))
      try {
        writeFileSync(join(root, 'base.md'), catalog([], []))
        writeFileSync(join(root, 'left.md'), catalog(['Left'], []))
        writeFileSync(
          join(root, 'right.md'),
          same ? catalog(['Right one', 'Right two'], []) : catalog([], ['Right one', 'Right two']),
        )
        const merge = spawnSync(
          'git',
          ['merge-file', '--stdout', 'left.md', 'base.md', 'right.md'],
          { cwd: root, encoding: 'utf8' },
        )
        expect(
          merge.status,
          `independent catalog additions caused an index conflict:\n${merge.stdout}\n${merge.stderr}`,
        ).toBe(0)
        const regenerated = same
          ? catalog(['Left', 'Right one', 'Right two'], [])
          : catalog(['Left'], ['Right one', 'Right two'])
        expect(merge.stdout, 'merged index is stale against the combined source catalog').toBe(
          regenerated,
        )
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
  it('retains category headings and links to the complete entry pages', () => {
    const index = catalog([], [])
    expect(index).toContain('[Reactivity Mistakes](/docs/troubleshooting/reactivity)')
    expect(index).toContain('[JSX Mistakes](/docs/troubleshooting/jsx)')
    expect(index).toContain('MCP `get_anti_patterns`')
  })
})
