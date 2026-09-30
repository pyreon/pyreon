import { state } from '@pyreon/core/plain'

export default function MobileMenu() {
  let open = state(false)
  return (
    <div data-testid="mobile-menu" style="padding: 12px; border: 1px solid #ccc; border-radius: 4px;">
      <strong>Mobile-only menu:</strong>{' '}
      <button
        data-testid="mobile-menu-toggle"
        type="button"
        onClick={() => { open = !open }}
      >
        {open ? 'Close' : 'Open'}
      </button>
      <span data-testid="mobile-menu-state" style="margin-left: 8px;">
        {open ? 'open' : 'closed'}
      </span>
    </div>
  )
}
