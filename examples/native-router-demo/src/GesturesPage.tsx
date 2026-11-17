// @ts-nocheck — PMTC handles typing; see RouterApp.tsx.
//
// Gestures row (GES-1): the gesture vocabulary the motion page does not
// reach. Three claims, each its own readout so a device test reads them as
// text:
//
// 1. Vertical swipe — `<Press onSwipeUp/onSwipeDown>` beside the horizontal
//    pair. 'up'/'down' prove the vertical branch fired with the right sign,
//    'left'/'right' after a vertical swipe would mean the axis guard is
//    wrong, and 'tap' that the drag degraded to a press.
// 2. Rotate — `<Gesture onRotate>`: the end-phase verdict ('cw'/'ccw') and
//    the cumulative degrees.
// 3. Live values — every 'change' sample writes its value BEFORE the end
//    (`Live dx`, `Live scale`, `Live deg`), and `Changes` counts the change
//    samples, so a test can read the positional value the gesture reported
//    while it ran, not only the end verdict.
import { Button, Canvas, CanvasText, Gesture, Press, Stack, Text } from '@pyreon/primitives'
import { state as plainState } from '@pyreon/core/plain'
import { useNavigate } from '@pyreon/router'

export function GesturesPage() {
  const navigate = useNavigate()
  let vswipe = plainState<string>('none')
  let liveDx = plainState(0)
  let liveScale = plainState(100)
  let liveDeg = plainState(0)
  let changes = plainState(0)
  let rotDir = plainState<string>('none')
  return (
    <Stack gap={2} padding={4} data-testid="gestures-page">
      <Text>Gestures</Text>
      <Text data-testid="vswipe-status">VSwipe: {vswipe}</Text>
      <Press
        onPress={() => { vswipe = 'tap' }}
        onSwipeLeft={() => { vswipe = 'left' }}
        onSwipeRight={() => { vswipe = 'right' }}
        onSwipeUp={() => { vswipe = 'up' }}
        onSwipeDown={() => { vswipe = 'down' }}
        data-testid="vswipe-zone"
      >
        <Canvas width={300} height={110} background="muted">
          <CanvasText x={14} y={60} size={14} fill="text">Swipe up or down</CanvasText>
        </Canvas>
      </Press>
      <Text data-testid="live-dx">Live dx: {liveDx}</Text>
      <Text data-testid="live-scale">Live scale: {liveScale}</Text>
      <Text data-testid="live-deg">Live deg: {liveDeg}</Text>
      <Text data-testid="live-changes">Changes: {changes}</Text>
      <Text data-testid="rotate-status">Rotate: {rotDir}</Text>
      <Gesture
        data-testid="live-zone"
        onPan={(e) => {
          if (e.phase === 'start') changes = 0
          if (e.phase === 'change') {
            liveDx = Math.round(e.dx)
            changes = changes + 1
          }
        }}
        onPinch={(e) => {
          if (e.phase === 'change') liveScale = Math.round(e.scale * 100)
        }}
        onRotate={(e) => {
          if (e.phase === 'change') liveDeg = Math.round(e.degrees)
          if (e.phase === 'end') rotDir = e.degrees > 15 ? 'cw' : e.degrees < -15 ? 'ccw' : 'flat'
        }}
      >
        <Canvas width={300} height={220} background="muted">
          <CanvasText x={14} y={110} size={14} fill="text">Drag, pinch or rotate here</CanvasText>
        </Canvas>
      </Gesture>
      <Button onPress={() => navigate('/')}>Back to Home</Button>
    </Stack>
  )
}
