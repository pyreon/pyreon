// Custom hooks for RouterApp, in their own module — the way an app is usually organised.
//
// A hook's state is view state natively (@State / remember), which only exists inside a component, so PMTC inlines
// a hook imported from a relative module into each component that calls it (inline-hooks.ts): the imports and types
// this file's hooks use travel with them. Until it did, `usePostEcho(token)` would have been emitted unchanged, with
// no warning, and the native build would have failed on a function that does not exist natively.
import { useFetch } from '@pyreon/hooks'

// The server REFLECTS what it received, so the assertion is on what actually reached the wire.
export interface EchoReply {
  id: string
  method: string
  body: string
  authorization: string
}

// The Authorization value is a RUNTIME string built from a signal — evaluated on the device when the request is built,
// which is what a signed-in app needs to send its token.
export function usePostEcho(token: () => string) {
  return useFetch<EchoReply>('http://localhost:8790/echo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token()}` },
    body: '{"name":"pyreon"}',
  })
}
