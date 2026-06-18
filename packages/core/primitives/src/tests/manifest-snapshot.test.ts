import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import { describe, expect, it } from 'vitest'
import primitivesManifest from '../manifest'

// Spot-check snapshot for @pyreon/primitives' manifest → generated docs.
// The api[] is 17 entries (15 primitives + <WebView> + the <Web> escape
// hatch group) of prose-dense MCP text, so a full inline snapshot would
// rot fast — instead assert the rendered SHAPE (bullet, section header,
// every primitive present as a get_api entry). The CI `Docs Sync` job
// locks byte-exact drift against the committed llms / api-reference.

describe('gen-docs — @pyreon/primitives snapshot', () => {
  it('renders the llms.txt bullet', () => {
    const line = renderLlmsTxtLine(primitivesManifest)
    expect(line.startsWith('- @pyreon/primitives — ')).toBe(true)
    expect(line).toContain('15 cross-platform UI primitives')
    expect(line).toContain('WebView')
  })

  it('renders the llms-full.txt section header', () => {
    const section = renderLlmsFullSection(primitivesManifest)
    expect(section).toContain('## @pyreon/primitives — Canonical Multiplatform Primitives')
    // The multiplatform boundary is the load-bearing fact for the AI.
    expect(section).toContain('PMTC')
  })

  it('exposes all 15 primitives + WebView + escape hatch as get_api entries', () => {
    const rendered = JSON.stringify(renderApiReferenceEntries(primitivesManifest))
    for (const name of [
      'Stack', 'Inline', 'Layer', 'Scroll', 'Spacer',
      'Text', 'Heading', 'Image', 'Icon',
      'Button', 'Press', 'Link',
      'Field', 'Toggle', 'Modal',
      'WebView', 'Web',
    ]) {
      expect(rendered).toContain(`primitives/${name}`)
    }
  })

  it('carries the key native idioms (onPress, type-not-interface, Inline-Android-overflow)', () => {
    const rendered = JSON.stringify(renderApiReferenceEntries(primitivesManifest))
    expect(rendered).toContain('onPress')
    expect(rendered).toContain('onChangeText')
    expect(rendered.toLowerCase()).toContain('android') // <Inline> non-wrapping Row gotcha
  })
})
