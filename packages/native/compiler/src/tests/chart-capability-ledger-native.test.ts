/**
 * The native half of the chart capability ledger's honesty rule.
 *
 * `@pyreon/charts`' ledger (`CHART_CAPABILITIES`) states a status per target.
 * The web half of the rule lives next to the ledger: every unsupported warning
 * in the option facade is tagged with a row, and a tagged row cannot be
 * complete on the web. This file is the same rule for iOS and Android, read
 * off the emitters' OWN tables of what they do not lower: a prop a native
 * host names and drops is a gap in the row that owns it, so that row cannot be
 * complete natively.
 *
 * The map below is TOTAL over the unlowered props. A prop added to either
 * table without a row fails here, rather than quietly vanishing from the
 * score.
 */
import { describe, expect, it } from 'vitest'
import { CHART_CAPABILITIES } from '@pyreon/charts/engine'
import { ACCESSOR_CHART_HOSTS, CHART_CHROME_PROPS, CHART_HOSTS, FRAME_CHART_HOSTS, PLOT_UNLOWERED_PROPS, chartChromeUnlowered } from '../chart-hosts'

/** Which ledger row each native-unlowered host prop belongs to. */
const ROW_OF_PROP: Readonly<Record<string, string>> = {
  onHighlight: 'runtime.events',
  onClick: 'runtime.events',
  onDoubleClick: 'runtime.events',
  onContextMenu: 'runtime.events',
  onRendered: 'runtime.events',
  emphasis: 'presentation.states',
  crosshair: 'coordinates.axis-pointer',
  link: 'runtime.connected-groups',
  keyboard: 'presentation.a11y-keyboard',
  accessibleTable: 'presentation.a11y-table',
  facet: 'coordinates.grid',
  facetColumns: 'coordinates.grid',
  showTitle: 'coordinates.title',
  subtitle: 'coordinates.title',
  showLegend: 'coordinates.legend',
  legendPosition: 'coordinates.legend',
  tooltip: 'coordinates.tooltip',
  animate: 'presentation.animation',
  updateAnimation: 'presentation.animation',
  updateDuration: 'presentation.animation',
  universalTransition: 'presentation.universal-transition',
  toolbox: 'coordinates.toolbox',
  onSaveImage: 'presentation.export-snapshot',
  rtl: 'presentation.rtl',
}

const HOST_TAGS = [...Object.keys(CHART_HOSTS), ...Object.keys(ACCESSOR_CHART_HOSTS), ...Object.keys(FRAME_CHART_HOSTS)]
const rowById = new Map(CHART_CAPABILITIES.filter((r) => r.mode === 'direct').map((r) => [r.id, r]))

describe('native half of the chart capability ledger', () => {
  it('maps every unlowered host prop to a real ledger row', () => {
    const props = new Set([...PLOT_UNLOWERED_PROPS, ...CHART_CHROME_PROPS])
    // Guards the premise: a table that emptied out would make every check below vacuous.
    expect(props.size).toBeGreaterThan(20)
    expect(HOST_TAGS.length).toBeGreaterThan(15)
    for (const p of props) {
      const id = ROW_OF_PROP[p]
      expect(id, `unlowered prop \`${p}\` has no ledger row`).toBeDefined()
      expect(rowById.has(id!), `\`${p}\` maps to unknown row ${id}`).toBe(true)
    }
  })

  it('a row cannot be complete on a phone while a native host still drops one of its props', () => {
    const dropped = new Map<string, string[]>()
    const note = (prop: string, where: string): void => {
      const id = ROW_OF_PROP[prop]!
      dropped.set(id, [...(dropped.get(id) ?? []), `${where}.${prop}`])
    }
    for (const p of PLOT_UNLOWERED_PROPS) note(p, 'PlotChart')
    for (const tag of HOST_TAGS) for (const p of chartChromeUnlowered(tag)) note(p, tag)
    for (const [id, where] of dropped) {
      const row = rowById.get(id)!
      expect(row.targets.ios, `${id} is complete on iOS, but ${where.join(', ')} is dropped there`).not.toBe('complete')
      expect(row.targets.android, `${id} is complete on Android, but ${where.join(', ')} is dropped there`).not.toBe('complete')
    }
  })
})
