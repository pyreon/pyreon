import pyreon from '@pyreon/vite-plugin'
import { zeroPlugin } from '../../../vite-plugin'

/**
 * The dev error overlay fixture, booted by `e2e-configs/zero-dev-overlay.config.ts`.
 *
 * Its own app rather than a shared example: three of its routes fail on
 * purpose (an SSR render error, a loader error, a hydration mismatch), which
 * would break every other suite that crawls an example. Imports zero by
 * relative path and resolves `@pyreon/*` with the `bun` condition, so the
 * suite runs the SOURCE and cannot pass against a stale `lib/`.
 */
export default {
  plugins: [pyreon(), zeroPlugin({ mode: 'ssr' })],
  resolve: { conditions: ['bun'] },
  ssr: { resolve: { conditions: ['bun'] } },
  logLevel: 'warn',
}
