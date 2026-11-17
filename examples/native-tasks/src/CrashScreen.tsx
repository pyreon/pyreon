// @ts-nocheck — PMTC handles typing; see TasksApp.tsx.
//
// Crash-reporting row (CRA-3): an UNCAUGHT exception captured on a device and
// reported on the next launch. The device tests crash the app from outside the
// shared source while this screen's reporter is running — an NSException
// raised by the iOS host on a Darwin notification the UI test posts, a
// RuntimeException thrown on the main thread by the Android test — then
// relaunch, open this screen again and read the report the reporter persisted
// before the process died.
import { useCrashReporter } from '@pyreon/hooks'
import { Button, Stack, Text } from '@pyreon/primitives'
import { useNavigate } from '@pyreon/router'

export function CrashScreen() {
  const navigate = useNavigate()
  const crash = useCrashReporter()
  return (
    <Stack gap={2} padding={4} data-testid="crash-page">
      <Text data-testid="crash-armed">Armed</Text>
      <Text data-testid="crash-had">Had crash: {String(crash.hadCrash)}</Text>
      <Text data-testid="crash-proof">Proof: {crash.lastCrash.includes('PyreonCrashProof') ? 'yes' : 'no'}</Text>
      <Button onPress={() => crash.clear()} data-testid="crash-clear">
        Clear crash
      </Button>
      <Button onPress={() => navigate('/tasks')} data-testid="crash-back">
        Back
      </Button>
    </Stack>
  )
}
