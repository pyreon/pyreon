import { playwright } from '@vitest/browser-playwright'
import { defineBrowserConfig } from '../../../vitest.browser'

// Real-Chromium browser tests for `@pyreon/dnd` hooks. The unit suite
// in `src/tests/dnd.test.ts` covers signal surfaces under happy-dom,
// but pragmatic-drag-and-drop's external/file adapter listens to
// HTML5 drag events (with populated `DataTransfer`) at the WINDOW
// level — happy-dom's DataTransfer polyfill is incomplete enough that
// the adapter's `dragenter` activation path can't be exercised
// reliably there. This config + the companion `*.browser.test.tsx`
// drive the same pdnd Playwright pattern that the app-showcase /dnd
// e2e uses, but at the package level so the regression-lock for
// `useFileDrop`'s drop pathway lives next to the hook itself.
export default defineBrowserConfig(playwright())
