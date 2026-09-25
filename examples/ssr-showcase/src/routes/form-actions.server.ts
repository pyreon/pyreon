/** Server loader for `/form-actions` — reads the server-only guestbook. */
import { listEntries } from '../server/guestbook'

export async function serverLoader() {
  return listEntries()
}
