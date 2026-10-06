import { yaml } from './_md-safe'

/** Render navigation to the canonical generated category pages. */
export function renderTroubleshootingIndex(
  categories: ReadonlyMap<string, { heading: string }>,
): string {
  const out = [
    '---',
    `title: ${yaml('Troubleshooting')}`,
    `description: ${yaml('Common Pyreon mistakes and their fixes, grouped by area — the error & anti-pattern reference.')}`,
    '---',
    '',
    '# Troubleshooting',
    '',
    `Common mistakes and anti-patterns across Pyreon, grouped by area, each with its fix. Distilled from the framework's own anti-pattern catalog — the same source MCP \`get_anti_patterns\` serves to AI agents. Many are caught automatically by [\`@pyreon/lint\`](/docs/lint), \`pyreon doctor\`, or MCP \`validate\`; the detector code is noted on each entry that has one.`,
    '',
    '## Categories',
    '',
  ]
  for (const [slug, { heading }] of categories) {
    out.push(`- **[${heading}](/docs/troubleshooting/${slug})**`)
  }
  return out.join('\n') + '\n'
}
