import { useHead } from "@pyreon/head"

export const meta = { title: "Billing" }

export default function Billing() {
  useHead({ title: meta.title })

  return (
    <>
      <div class="app-page-header">
        <h1>Billing</h1>
      </div>

      <div class="stat-card" style="max-width: 480px;">
        <div class="label">Plan</div>
        <div class="value" style="font-size: 1.125rem; margin-bottom: 1rem;">
          Free trial
        </div>
        <button class="btn btn-primary">Upgrade to Pro</button>
        <p style="margin-top: 1rem; font-size: 0.8125rem; color: var(--c-text-muted);">
          Wire Stripe Checkout into <code>/api/billing/checkout</code> in a follow-up. The
          dashboard template ships the UI shell — payment integration is intentionally left
          to the user since pricing models vary widely.
        </p>
      </div>
    </>
  )
}
