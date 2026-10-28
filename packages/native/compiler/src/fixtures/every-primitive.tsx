import { signal } from '@pyreon/reactivity'
import {
  Stack, Inline, Layer, Scroll, Text, Image, Video, Audio, Transition, Link, Modal, Press, Field, Gesture,
  Canvas, CanvasRect, CanvasCircle, CanvasLine, CanvasPath, CanvasText,
} from '@pyreon/primitives'
import { For } from '@pyreon/core'

export function ProbeApp() {
  const open = signal(false)
  const shown = signal(true)
  const notes = signal('')
  const rows = signal(4)
  const zoom = signal(1)
  const dx = signal(0)
  const turn = signal(0)
  const pts = signal([{ x: 10, y: 20 }, { x: 40, y: 50 }])
  const trail = signal('M0 0 L10 10')
  return (
    <Stack margin={4} marginX={2} marginY={1} padding={2} background="primary" radius="md">
      <Inline margin={2} gap={2}>
        <Text color="primary" size="lg" weight="bold">hello</Text>
      </Inline>
      <Layer margin={1}>
        <Image src="https://x.test/a.png" alt="remote cover" fit="cover" />
      </Layer>
      <Scroll margin={1} axis="horizontal">
        <Image src="https://x.test/b.png" alt="remote contain" fit="contain" width={100} height={50} />
        <Image src="https://x.test/c.png" alt="remote fill" fit="fill" />
        <Image src="https://x.test/d.png" alt="remote none" fit="none" />
      </Scroll>
      <Video src="https://x.test/a.mp4" controls={false} autoPlay loop muted />
      <Audio src="https://x.test/a.mp3" data-testid="probe-audio" accessibilityLabel="Audio" />
      <Transition show={shown()} name="slideUp" data-testid="probe-trans" accessibilityLabel="Fading">
        <Text>animated</Text>
      </Transition>
      <Link to="/next" data-testid="probe-link" accessibilityLabel="Go next">next</Link>
      <Press onPress={() => open.set(true)} disabled><Text>tap</Text></Press>
      <Gesture
        data-testid="probe-gesture"
        onPan={(e) => dx.set(e.dx)}
        onPinch={(e) => { zoom.set(e.scale); if (e.phase === 'end') open.set(false) }}
        onRotate={(e) => turn.set(e.degrees)}
      >
        <Layer translateX={dx()} translateY={-4} scale={zoom()} rotate={turn()}>
          <Text rotate={15}>transformed</Text>
        </Layer>
      </Gesture>
      <Canvas width={200} height={120} background="surface" data-testid="probe-canvas" rotate={-3}>
        <CanvasRect x={4} y={4} width={dx()} height={40} radius={6} fill="primary" stroke="#00000080" strokeWidth={1.5} />
        <CanvasCircle cx={100} cy={60} r={zoom()} />
        <CanvasLine x1={0} y1={119} x2={199} y2={119} stroke="muted" />
        <CanvasPath d={trail()} stroke="danger" strokeWidth={3} />
        <CanvasPath d="M10 10 h20 v20 a10 10 0 0 1 -20 0 z" fill="success" />
        <For each={pts()} by={(p) => p.x}>
          {(p) => <CanvasCircle cx={p.x} cy={p.y} r={4} fill="warning" />}
        </For>
        <CanvasText x={8} y={90} size={12} fill="secondary">Zoom {zoom()}</CanvasText>
      </Canvas>
      <Field value={notes} onChangeText={(v) => notes.set(v)} kind="email" onSubmit={() => open.set(true)} />
      <Field multiline value={notes} onChangeText={(v) => notes.set(v)} placeholder="Notes" data-testid="probe-notes" />
      <Field multiline lines={rows()} value={notes()} onChangeText={(v) => notes.set(v)} />
      <Modal open={open()} onClose={() => open.set(false)} data-testid="probe-modal" accessibilityLabel="Dialog">
        <Text>modal body</Text>
      </Modal>
    </Stack>
  )
}
