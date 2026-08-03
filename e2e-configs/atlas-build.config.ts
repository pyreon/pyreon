import { definePlaywrightConfig } from '@pyreon/playwright-config'

/**
 * `atlas build` e2e — builds the STATIC site with the real CLI, then serves the
 * emitted directory as a plain static host would.
 *
 * Served by `scripts/serve-ssg.ts`, deliberately NOT `vite preview`: preview
 * applies an SPA fallback, which would serve `index.html` for a missing asset
 * and turn a broken build into a passing test. The point of this gate is that
 * the directory works on a dumb file server — the same reasoning that made the
 * SSG e2e stop using preview.
 *
 * The one thing only this gate can catch: the built site has NO server, so the
 * node-answered panels (Docs source, Reactivity Lens) work only if the build
 * baked them. Every unit test around that logic passes whether or not the
 * baking is actually wired into the emitted HTML.
 */
export default definePlaywrightConfig({
  testDir: '../e2e',
  projects: [{ name: 'atlas-build', testMatch: /atlas-build\.spec\.ts$/, port: 5216 }],
  webServer: [
    {
      command:
        'bun packages/tools/atlas/bin/atlas.js build examples/atlas-workshop --out atlas-dist-e2e --title "Atlas E2E" && ' +
        'bun scripts/serve-ssg.ts examples/atlas-workshop/atlas-dist-e2e 5216',
      cwd: '..',
      port: 5216,
      // The build runs a real Vite production build over the workshop example
      // plus a lens pass per component; 120s is not enough on a cold CI runner.
      timeout: 240_000,
    },
  ],
})
