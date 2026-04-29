import { redirect } from "@pyreon/router"

/** Step 2 of the redirect-chain regression fixture. See `chain-a.tsx`. */
export async function loader(): Promise<never> {
  redirect("/login")
}

export default function ChainBFixture() {
  return <div>fixture</div>
}
