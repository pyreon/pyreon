import { signal } from '@pyreon/reactivity'

export default function MobileMenu() {
  const open = signal(false)
  return (
    <div
      data-testid="mobile-menu"
      style="padding: 12px; border: 1px solid #ccc; border-radius: 4px;"
    >
      <strong>Mobile-only menu:</strong>{' '}
      <button data-testid="mobile-menu-toggle" type="button" onClick={() => open.set(!open())}>
        {open() ? 'Close' : 'Open'}
      </button>
      <span data-testid="mobile-menu-state" style="margin-left: 8px;">
        {open() ? 'open' : 'closed'}
      </span>
    </div>
  )
}
