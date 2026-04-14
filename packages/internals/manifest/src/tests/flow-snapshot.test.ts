import flowManifest from '../../../../fundamentals/flow/manifest'
import { renderLlmsTxtLine } from '../../../../../scripts/gen-docs'

// Snapshot of the exact rendered llms.txt line for @pyreon/flow. Locks
// the public output so a future generator tweak (or accidental manifest
// edit) surfaces in diff. Update deliberately by running the test with
// `-u` if you changed the format or the manifest on purpose.

describe('gen-docs — flow snapshot', () => {
  it('renders @pyreon/flow to its expected llms.txt bullet', () => {
    expect(renderLlmsTxtLine(flowManifest)).toMatchInlineSnapshot(
      `"- @pyreon/flow — Reactive flow diagrams — signal-native nodes, edges, pan/zoom, auto-layout via elkjs (peer: @pyreon/runtime-dom). LayoutOptions.direction / layerSpacing / edgeRouting apply to layered/tree only — force/stress/radial/box/rectpacking silently ignore them. nodeSpacing is the only field respected by every algorithm. Dev-mode console.warn fires when an option is set on an algorithm that ignores it."`,
    )
  })
})
