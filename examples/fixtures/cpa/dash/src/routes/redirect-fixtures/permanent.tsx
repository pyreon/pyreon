import { redirect } from "@pyreon/router"

/**
 * Regression fixture for `redirect(url, 308)` — verifies the SSR handler
 * preserves a custom non-default status code on the wire (default is 307).
 * Paired with `e2e/cpa-dash.spec.ts` permanent-redirect spec.
 */
export async function loader(): Promise<never> {
  redirect("/login", 308)
}

export default function PermanentRedirectFixture() {
  // Unreachable — loader always throws. Component must exist for fs-router
  // to register the route.
  return <div>fixture</div>
}
