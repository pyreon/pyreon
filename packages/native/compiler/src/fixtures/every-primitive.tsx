import { signal } from '@pyreon/reactivity'
import {
  Stack, Inline, Layer, Scroll, Text, Image, Video, Audio, Transition, Link, Modal, Press,
} from '@pyreon/primitives'

export function ProbeApp() {
  const open = signal(false)
  const shown = signal(true)
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
      <Modal open={open()} onClose={() => open.set(false)} data-testid="probe-modal" accessibilityLabel="Dialog">
        <Text>modal body</Text>
      </Modal>
    </Stack>
  )
}
