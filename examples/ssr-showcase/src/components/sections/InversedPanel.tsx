/**
 * InversedPanel — nested section wrapped in its OWN PyreonUI with
 * `inversed={true}`. Tests the exact bug PR #210 fixed: does the
 * nested PyreonUI correctly flip mode when its parent's mode changes?
 *
 * Expected behavior:
 * - Parent PyreonUI mode=light → this panel renders with mode=dark
 * - Parent PyreonUI mode=dark → this panel renders with mode=light
 * - Toggling the parent signal must update the panel text color
 */

import { PyreonUI, useMode } from '@pyreon/ui-core'
import { Section, SectionHeader } from '../base'
import { element, text } from '../core'
import { theme } from '../../theme'

const Panel = element
  .attrs({ tag: 'div', direction: 'rows', alignX: 'center' })
  .theme((t) => ({
    padding: t.space.xLarge,
    borderRadius: t.borderRadius.large,
    background: t.color.dark.base,
    color: t.color.light.base,
    maxWidth: 900,
    width: { xs: '90%', lg: '100%' },
  }))

const ModeLabel = text.theme((t) => ({
  fontSize: t.fontSize.medium,
  marginTop: t.space.medium,
  color: t.color.primary.base,
}))

function ModeReadout() {
  // useMode() returns the RESOLVED mode. If inversed is working, this
  // returns the OPPOSITE of the parent's mode.
  const mode = useMode()
  return <ModeLabel>{`Resolved mode inside inversed panel: ${mode}`}</ModeLabel>
}

const InversedPanel = () => (
  <Section id="inversed-panel">
    <SectionHeader title="Inversed Mode Panel">
      This panel is wrapped in a nested PyreonUI with inversed=true. The
      parent's mode is flipped for this subtree — used to test the
      reactivity fix from PR #210 where destructuring props broke the
      inverted-mode propagation.
    </SectionHeader>
    <PyreonUI theme={theme} mode="light" inversed>
      <Panel>
        <ModeReadout />
      </Panel>
    </PyreonUI>
  </Section>
)

InversedPanel.displayName = 'sections/InversedPanel'
export default InversedPanel
