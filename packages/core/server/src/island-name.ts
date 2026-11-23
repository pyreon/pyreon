/**
 * Whether `name` is a valid server-island name. The ONE rule, enforced by
 * `serverIsland()` at registration and by the client before it fetches a
 * marker's fragment, so a name the server accepts is never refused in the
 * browser.
 *
 * A name becomes one path segment of `/_pyreon/fragment/<name>`, escaped with
 * `encodeURIComponent`, so every character is safe there (`/`, `?`, `#`, `:`,
 * whitespace and unicode are all encoded) except a whole name of `.` or `..`:
 * those are dot segments the URL parser resolves, walking out of the
 * endpoint. Empty is not a name.
 */
export function isIslandName(name: string): boolean {
  return name !== '' && name !== '.' && name !== '..'
}
