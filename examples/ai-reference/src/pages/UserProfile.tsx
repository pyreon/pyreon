/**
 * Form page with signals for input state and validation.
 *
 * PATTERNS:
 *   - signal() for form fields
 *   - computed() for validation
 *   - onInput for real-time input handling (not onChange)
 *   - <Show> for conditional validation messages
 *   - onMount with cleanup
 */

import { onMount, Show } from "@pyreon/core"
import { useHead } from "@pyreon/head"
import { computed, effect, signal } from "@pyreon/reactivity"
import { useRoute } from "@pyreon/router"

export const UserProfile = () => {
  const route = useRoute<"/user/:id">()
  const name = signal("")
  const email = signal("")
  const saving = signal(false)

  const isValid = computed(() => name().length > 0 && email().includes("@"))

  useHead(() => ({ title: `User ${route().params.id}` }))

  // Load user data on mount
  onMount(() => {
    const controller = new AbortController()
    fetch(`/api/user/${route().params.id}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((user: { name: string; email: string }) => {
        name.set(user.name)
        email.set(user.email)
      })
      .catch(() => {
        // aborted or failed
      })
    return () => controller.abort()
  })

  // Auto-save effect (debounced via effect)
  effect(() => {
    const n = name()
    const e = email()
    if (!n || !e) return
    // Effect re-runs when name or email change (auto-tracked)
  })

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    if (!isValid()) return
    saving.set(true)
    await fetch(`/api/user/${route().params.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: name(), email: email() }),
    })
    saving.set(false)
  }

  return (
    <div>
      <h1>Edit Profile</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Name:
          <input type="text" value={name()} onInput={(e) => name.set(e.currentTarget.value)} />
        </label>

        <label>
          Email:
          <input type="email" value={email()} onInput={(e) => email.set(e.currentTarget.value)} />
        </label>

        <Show when={() => !isValid()}>
          <p class="error">Name required, email must contain @</p>
        </Show>

        <button type="submit" disabled={!isValid() || saving()}>
          {saving() ? "Saving..." : "Save"}
        </button>
      </form>
    </div>
  )
}
