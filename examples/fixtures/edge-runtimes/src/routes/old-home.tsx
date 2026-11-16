import { redirect } from '@pyreon/router'

/** A loader that redirects — the SSR response must be a real 3xx, not a page. */
export async function loader() {
  redirect('/posts/2', 308)
}

export default function OldHome() {
  return <p>unreachable</p>
}
