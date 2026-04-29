import { useHead } from "@pyreon/head"
import { Link } from "@pyreon/zero/link"

export const meta = { title: "Settings" }

export default function Settings() {
  useHead({ title: meta.title })

  return (
    <>
      <div class="app-page-header">
        <h1>Settings</h1>
      </div>

      <ul style="list-style: none; display: grid; gap: 1rem; padding: 0;">
        <li>
          <Link href="/app/settings/account" class="btn btn-secondary" style="width: 100%; justify-content: space-between;">
            Account <span>→</span>
          </Link>
        </li>
        <li>
          <Link href="/app/settings/billing" class="btn btn-secondary" style="width: 100%; justify-content: space-between;">
            Billing <span>→</span>
          </Link>
        </li>
      </ul>
    </>
  )
}
