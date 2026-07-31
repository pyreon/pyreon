/**
 * gen-docs snapshot — locks the rendered llms.txt bullet + the api surface
 * so unintended manifest-format regressions fail loudly (the repo-wide
 * manifest convention).
 */
import { renderLlmsTxtLine } from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — loom snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(
      `"- @pyreon/loom — Monorepo dependency observatory — workspace graph, version-sync drift, cycles, phantom deps, and blast radius, as data"`,
    )
  })

  it('names the two CLI commands + the programmatic entry', () => {
    const names = manifest.api?.map((a) => a.name) ?? []
    expect(names).toContain('loom scan')
    expect(names).toContain('loom dev')
    expect(names).toContain('buildReport')
  })
})
