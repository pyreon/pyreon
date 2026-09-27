import { createPost } from './actions'

// Keep the action reachable so the client bundle includes its stub.
;(globalThis as Record<string, unknown>).__action = createPost
