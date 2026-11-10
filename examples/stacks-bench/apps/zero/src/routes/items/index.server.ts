// Server loader for /items — "Server Loaders" in docs/src/content/docs/zero.md
// (https://pyreon.dev/docs/zero#server-loaders): a `.server.ts` sibling never ships to the client.
import { listItems } from '../../server/data'

export async function serverLoader() {
  return { items: await listItems() }
}
