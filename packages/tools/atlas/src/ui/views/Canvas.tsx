/** Canvas view — the live preview on a zoomable, dotted stage. */
import * as C from '../chrome'
import type { WorkbenchModel } from '../model'
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

      <C.Stage>
        <C.Frame>
          <C.FrameChrome>{() => `${m.brand().name} · ${m.dark() ? 'dark' : 'light'}`}</C.FrameChrome>
          <C.PreviewSurface data-testid="canvas-preview" size={('z' + ZOOM_PCT[m.zoomIdx()]) as never}>{() => m.preview()}</C.PreviewSurface>
        </C.Frame>
      </C.Stage>
    </C.Main>
  )
}
