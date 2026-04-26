import { playwright } from '@vitest/browser-playwright'
import pyreon from '@pyreon/vite-plugin'
import {
  defineBrowserConfig,
  type BrowserProviderFactory,
} from '../../vitest.browser'

// E2 imports `@pyreon/ui-components` which transitively pulls JSX `.tsx`
// files (e.g. `@pyreon/ui-primitives/TabsBase.tsx`). Vite's default JSX
// transform doesn't know how to handle Pyreon's `jsx: "preserve"` shape
// — needs the `@pyreon/vite-plugin`'s OXC-based transform to compile.
export default defineBrowserConfig(playwright() as unknown as BrowserProviderFactory, {
  plugins: [pyreon()],
})
