// @ts-nocheck — PMTC handles typing; see RouterApp.tsx.
//
// Animations row (ANI-2): the `spring` curve on `<Transition>`. A spring's
// `duration` is its response, and it runs until it SETTLES, so a bouncy
// spring outlasts its duration by a wide margin while a tween of the same
// duration ends on time. That gap is what the Android test reads on the
// compose clock: the bouncy box (response 2000 ms, bounce 0.8, which settles
// after about 7 s) is still leaving 3000 ms in, when a 2000 ms tween would
// be long gone.
import { state as plainState } from '@pyreon/core/plain'
import { Button, Stack, Text, Transition } from '@pyreon/primitives'
import { useNavigate } from '@pyreon/router'

export function SpringPage() {
  const navigate = useNavigate()
  let on = plainState<boolean>(true)
  return (
    <Stack gap={2} padding={4} data-testid="spring-page">
      <Text>Spring</Text>
      <Button onPress={() => { on = !on }} data-testid="spring-toggle">
        Toggle springs
      </Button>
      <Transition show={() => on} duration={2000} easing="spring">
        <Text data-testid="spring-box">Spring Box</Text>
      </Transition>
      <Transition show={() => on} duration={2000} easing="spring" bounce={0.8} name="scale">
        <Text data-testid="bouncy-box">Bouncy Box</Text>
      </Transition>
      <Button onPress={() => navigate('/')}>Back to Home</Button>
    </Stack>
  )
}
