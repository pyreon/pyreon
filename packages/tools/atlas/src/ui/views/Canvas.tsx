/** Canvas view — the live preview on a zoomable, dotted stage. */
import * as C from '../chrome'
import type { WorkbenchModel } from '../model'
import { BACKGROUND_VARIANT, localeDir, VIEWPORT_SIZE, viewportById } from '../addons'
import { ZOOM_PCT } from '../model'

export function Canvas(props: { model: WorkbenchModel }) {
  const m = props.model
  return (
    <C.Main>
      <C.CanvasBar>
        <C.Col>
          <C.CanvasName data-testid="canvas-name">{() => m.sel()?.name ?? ''}</C.CanvasName>
          <C.CanvasPath>{() => `components/${m.selId()}`}</C.CanvasPath>
        </C.Col>
        <C.Spacer />
        <C.Segment>
          <C.ZoomBtn onClick={() => m.zoomIdx.set(Math.max(0, m.zoomIdx() - 1))}>−</C.ZoomBtn>
          <C.ZoomLabel data-testid="zoom-label">{() => `${ZOOM_PCT[m.zoomIdx()]}%`}</C.ZoomLabel>
          <C.ZoomBtn onClick={() => m.zoomIdx.set(Math.min(ZOOM_PCT.length - 1, m.zoomIdx() + 1))}>+</C.ZoomBtn>
        </C.Segment>
      </C.CanvasBar>

      {/*
        Addon dimensions are passed as ACCESSORS (`() => …`) like every other
        signal-driven dimension here, so they re-resolve without the compiler —
        see ../Workbench for why that matters for the prebuilt lib.
      */}
      <C.Stage>
        <C.Frame data-testid="canvas-frame" size={() => VIEWPORT_SIZE[m.viewport()] as never}>
          <C.FrameChrome>
            {() =>
              `${m.brand().name} · ${m.dark() ? 'dark' : 'light'}${
                m.viewport() === 'full' ? '' : ` · ${viewportById(m.viewport()).hint}`
              }${m.pseudo() ? ` · :${m.pseudo()}` : ''}${m.locale() === 'en' ? '' : ` · ${m.locale()}`}`
            }
          </C.FrameChrome>
          <C.PreviewSurface
            data-testid="canvas-preview"
            size={() => ('z' + ZOOM_PCT[m.zoomIdx()]) as never}
            variant={() => BACKGROUND_VARIANT[m.background()] as never}
            state={() => (m.outline() ? 'outlined' : 'plain') as never}
          >
            {() => m.preview()}
          </C.PreviewSurface>
        </C.Frame>
      </C.Stage>
    </C.Main>
  )
}
