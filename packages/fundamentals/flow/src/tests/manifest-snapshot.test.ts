import { renderLlmsTxtLine } from '@pyreon/manifest'
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
})
