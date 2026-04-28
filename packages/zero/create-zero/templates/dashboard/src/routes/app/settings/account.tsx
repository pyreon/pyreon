import { useHead } from "@pyreon/head"

export const meta = { title: "Account settings" }

export default function AccountSettings() {
  useHead({ title: meta.title })

  return (
    <>
      <div class="app-page-header">
        <h1>Account</h1>
      </div>

      <form style="max-width: 480px; display: grid; gap: 1rem;">
        <div class="field">
          <label for="name">Name</label>
          <input id="name" type="text" placeholder="Your name" />
        </div>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" placeholder="you@example.com" />
        </div>
        <div>
          <button type="submit" class="btn btn-primary">
            Save changes
          </button>
        </div>
      </form>
    </>
  )
}
