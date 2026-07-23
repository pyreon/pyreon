/** Theme Lab view — the selected component tiled across every theme × mode. */
import { PyreonUI } from '@pyreon/ui-core'
import * as C from '../chrome'
import type { WorkbenchModel } from '../model'
import { THEMES, tokens } from '../theme'

export function LabView({ model: m }: { model: WorkbenchModel }) {
  return (
    <C.LabWrap>
      <C.LabGrid data-testid="lab-grid">
        {THEMES.flatMap((b) =>
          [true, false].map((d) => (
            <PyreonUI theme={tokens(b, d) as never} mode={d ? 'dark' : 'light'}>
              <C.LabTile>
                <C.LabTileHead>
                  <C.LabTileName>{b.name}</C.LabTileName>
                  <C.LabTileMode>{d ? 'dark' : 'light'}</C.LabTileMode>
                </C.LabTileHead>
                <C.LabTileBody>{() => m.preview()}</C.LabTileBody>
              </C.LabTile>
            </PyreonUI>
          )),
        )}
      </C.LabGrid>
    </C.LabWrap>
  )
}
