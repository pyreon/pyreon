import { redirect } from "@pyreon/router"

/**
 * Step 1 of a 3-hop redirect chain regression fixture. Exercises the
 * navigate flow's redirect-depth counter — `/redirect-fixtures/chain-a` →
 * `/redirect-fixtures/chain-b` → `/login`. SSR returns 307 + Location
 * for each hop; the browser follows the chain (or, on a strict client,
 * up to its redirect cap) and lands on the final target.
 */
export async function loader(): Promise<never> {
  redirect("/redirect-fixtures/chain-b")
}

export default function ChainAFixture() {
  return <div>fixture</div>
}
