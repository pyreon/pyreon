import { defineAction } from '@pyreon/zero/actions'

// Imported by NO route module the tests render — only the build-time action
// manifest can make it reachable on a fresh dev server.
export const ping = defineAction(async () => ({ pong: true }))
