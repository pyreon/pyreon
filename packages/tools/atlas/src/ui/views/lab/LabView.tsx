/** Theme Lab view — the selected component tiled across every theme × mode. */
import { PyreonUI } from '@pyreon/ui-core'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'
import { THEMES, tokens } from '../../theme'

/**
 * Which tiles the Lab can HONESTLY show.
 *
 * Every tile renders under its own appearance (`m.preview({ dark, brandId })`),
 * which reaches the component two ways: the tile's `<PyreonUI>` (the workbench
 * tokens — what a hand-written catalog's components style from) and the
 * project `wrapper`'s `mode`/`brand` accessors (what a scanned library's own
 * provider reads). A WRAPPED catalog renders through the project's provider,
 * so the workbench brands only reach it if the wrapper consumes `brand` — and
 * when it does not, eight tiles were four identical pairs presented as eight
 * themes. Then the Lab shows one tile per mode and says why.
 */
export function labTiles(
  wrapped: boolean,
  reads: { mode: boolean; brand: boolean },
): { brands: boolean; note: string } {
  if (!wrapped || reads.brand) return { brands: true, note: '' }
  const modeNote = reads.mode
    ? ''
    : ' It does not read `mode` either, so light and dark may render the same.'
  return {
    brands: false,
    note:
      "This project's wrapper does not read `brand`, so the workbench brands cannot restyle its components — showing one tile per mode." +
      modeNote +
      ' Map `props.brand().id` to one of your themes in atlas.config.ts to compare brands here.',
  }
}

export function LabView(props: { model: WorkbenchModel }) {
  const m = props.model
  return (
    <C.LabWrap>
      {() => {
        const plan = labTiles(m.wrapped, m.wrapperReads())
        const brands = plan.brands
          ? THEMES
          : [THEMES.find((b) => b.id === m.brandId()) ?? THEMES[0]!]
        return (
          <>
            {plan.note ? <C.LabNote data-testid="lab-note">{plan.note}</C.LabNote> : null}
            <C.LabGrid data-testid="lab-grid">
              {brands.flatMap((b) =>
                [true, false].map((d) => (
                  <PyreonUI theme={tokens(b, d) as never} mode={d ? 'dark' : 'light'}>
                    <C.LabTile
                      data-testid={`lab-tile-${plan.brands ? `${b.id}-` : ''}${d ? 'dark' : 'light'}`}
                    >
                      <C.LabTileHead>
                        <C.LabTileName>
                          {plan.brands ? b.name : (m.sel()?.name ?? '')}
                        </C.LabTileName>
                        <C.LabTileMode>{d ? 'dark' : 'light'}</C.LabTileMode>
                      </C.LabTileHead>
                      <C.LabTileBody>{() => m.preview({ dark: d, brandId: b.id })}</C.LabTileBody>
                    </C.LabTile>
                  </PyreonUI>
                )),
              )}
            </C.LabGrid>
          </>
        )
      }}
    </C.LabWrap>
  )
}
