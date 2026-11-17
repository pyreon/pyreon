// @ts-nocheck — PMTC handles typing; see RouterApp.tsx.
//
// Adaptive row (ADP-3): the two adaptive shapes the home page does not reach.
//
// 1. A two-element responsive ARRAY in a style object, `padding: [8, 24]`
//    (unistyle's mobile-first idiom). Native resolves it per size class:
//    compact → 8, regular → 24 (the 600 dp boundary `useSizeClass` uses), so
//    the child's inset inside the box reads which class the array resolved.
// 2. A size-class-driven Stack↔Inline swap: compact stacks A above B, regular
//    puts B beside A. The geometry of the same two tags tells them apart.
//
// Android flips the class live on one device (`wm size`); iOS asserts the
// compact half on the iPhone Simulator.
import { useSizeClass } from '@pyreon/hooks'
import { Button, Inline, Stack, Text } from '@pyreon/primitives'
import { useNavigate } from '@pyreon/router'

export function AdaptivePage() {
  const navigate = useNavigate()
  const sizeClass = useSizeClass()
  return (
    <Stack gap={2} padding={4} data-testid="adaptive-page">
      <Text data-testid="adp-class">Class: {sizeClass}</Text>
      <Stack style={{ padding: [8, 24] }} data-testid="adp-pad-box">
        <Text data-testid="adp-pad-child">Padded by a responsive array</Text>
      </Stack>
      {sizeClass() === 'regular'
        ? (
            <Inline gap={4} data-testid="adp-swap-inline">
              <Text data-testid="adp-swap-a">Wide A</Text>
              <Text data-testid="adp-swap-b">Wide B</Text>
            </Inline>
          )
        : (
            <Stack gap={4} data-testid="adp-swap-stack">
              <Text data-testid="adp-swap-a">Narrow A</Text>
              <Text data-testid="adp-swap-b">Narrow B</Text>
            </Stack>
          )}
      <Button onPress={() => navigate('/')}>Back to Home</Button>
    </Stack>
  )
}
