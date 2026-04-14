import { renderLlmsFullSection, renderLlmsTxtLine } from '@pyreon/manifest'
import flowManifest from '../manifest'

// Snapshot of the exact rendered llms.txt line for @pyreon/flow. Lives
// inside @pyreon/flow (not in @pyreon/manifest) so ownership sits where
// the manifest does — a future flow API change that needs a manifest
// edit + regenerated snapshot stays within this package's review scope.
//
// Update intentionally via `bun run test -- -u` after a deliberate
// manifest change.

describe('gen-docs — flow snapshot', () => {
  it('renders @pyreon/flow to its expected llms.txt bullet', () => {
    expect(renderLlmsTxtLine(flowManifest)).toMatchInlineSnapshot(
      `"- @pyreon/flow — Reactive flow diagrams — signal-native nodes, edges, pan/zoom, auto-layout via elkjs (peer: @pyreon/runtime-dom). LayoutOptions.direction / layerSpacing / edgeRouting apply to layered/tree only — force/stress/radial/box/rectpacking silently ignore them. nodeSpacing is the only field respected by every algorithm. Dev-mode console.warn fires when an option is set on an algorithm that ignores it."`,
    )
  })

  it('renders @pyreon/flow to its expected llms-full.txt section header + blockquotes', () => {
    // Snapshot targets the stable bookends — header + peer-dep + gotcha
    // notes — rather than the full longExample body (which is long and
    // would require re-snapshot on every doc-example edit). The e2e
    // test asserts the FULL rendered output matches llms-full.txt
    // byte-for-byte.
    const rendered = renderLlmsFullSection(flowManifest)
    const header = rendered.split('\n\n')[0]
    const blockquotes = rendered
      .split('\n')
      .filter((line) => line.startsWith('>'))
      .join('\n')
    expect(header).toMatchInlineSnapshot(`"## @pyreon/flow — Flow Diagrams"`)
    expect(blockquotes).toMatchInlineSnapshot(`
      "> **Peer dep**: @pyreon/runtime-dom
      >
      > **Note**: LayoutOptions.direction / layerSpacing / edgeRouting apply to layered/tree only — force/stress/radial/box/rectpacking silently ignore them. nodeSpacing is the only field respected by every algorithm. Dev-mode console.warn fires when an option is set on an algorithm that ignores it.
      >
      > **Note**: Each node mounts exactly once across the lifetime of the graph — drags, selection, and updateNode mutations patch via per-node reactive accessors, not remount.
      >
      > **Note**: \`@pyreon/runtime-dom\` is required in consumer apps because flow JSX components emit \`_tpl()\` / \`_bind()\` calls — declare it as a direct dependency, not a transitive one.
      >
      > **Note**: Pyreon JSX components cannot be parameterised at the call site (\`<Flow<MyData> />\` is not valid JSX). \`FlowProps.instance\` is typed as \`FlowInstance<any>\` so typed consumers can pass their \`FlowInstance<MyData>\` without casting."
    `)
  })
})
