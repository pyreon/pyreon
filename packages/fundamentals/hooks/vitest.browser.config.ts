import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '@pyreon/vitest-config'

// Real-Chromium suite for @pyreon/hooks. Currently one file:
// useFocusTrap.browser.test.tsx — focus / Tab-cycling / visibility are
// unreliable under happy-dom (per test-environment-parity), so the trap's
// real-browser contract is asserted here.
export default defineBrowserConfig(playwright())
