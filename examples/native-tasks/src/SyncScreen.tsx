// @ts-nocheck — PMTC handles typing; see TasksApp.tsx.
//
// Offline / sync row (OFF-1): a synced value converging over the native
// WebSocket channel against a local relay (scripts/sync-relay.ts, port 8792).
// `connectPyreonSync(doc, webSocketChannel(url))` lowers to
// PyreonSyncTransport over PyreonSyncWebSocketChannel, opened when the screen
// appears. The device tests write on the RELAY and read `Title` here (a remote
// op updates the synced value), write here and read it off the relay (local
// ops reach the peer), then disconnect and check a later relay write no longer
// arrives.
import { connectPyreonSync, PyreonCrdtDoc, syncedSignal, webSocketChannel } from '@pyreon/sync'
import { Button, Stack, Text } from '@pyreon/primitives'
import { useNavigate } from '@pyreon/router'

export function SyncScreen() {
  const navigate = useNavigate()
  const doc = new PyreonCrdtDoc()
  const title = syncedSignal({ doc, key: 'relayTitle', initial: 'none' })
  const link = connectPyreonSync(doc, webSocketChannel('ws://localhost:8792/sync'))
  return (
    <Stack gap={2} padding={4} data-testid="sync-page">
      <Text data-testid="sync-title">Title: {title()}</Text>
      <Button onPress={() => title.set('from-device')} data-testid="sync-write">
        Write from device
      </Button>
      <Button onPress={() => link.disconnect()} data-testid="sync-disconnect">
        Disconnect
      </Button>
      <Button onPress={() => navigate('/tasks')} data-testid="sync-back">
        Back
      </Button>
    </Stack>
  )
}
