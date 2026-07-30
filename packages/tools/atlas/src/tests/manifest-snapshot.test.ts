/**
 * gen-docs snapshot — locks the rendered llms.txt bullet so unintended
 * manifest-format regressions surface as a failing diff (the repo-wide
 * manifest convention; see the flow reference).
 */
import { renderLlmsTxtLine } from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — atlas snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(
      `"- @pyreon/atlas — AI-native component workbench — derives, verifies, and serves a machine-readable component catalog"`,
    )
  })

  it('names the three CLI commands in the api surface', () => {
    const names = manifest.api?.map((a) => a.name) ?? []
    expect(names).toContain('atlas scan')
    expect(names).toContain('atlas dev')
    expect(names).toContain('atlas verify-browser')
  })
})
