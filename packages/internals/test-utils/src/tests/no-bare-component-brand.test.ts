/**
 * Whole-class guard: NO bare top-level component-brand assignments
 * (`Component.displayName = …`, `.pkgName`, `.PYREON__COMPONENT`, `.isText`)
 * in published framework source.
 *
 * WHY. `sideEffects: false` lets a bundler drop a module when NOTHING is
 * imported from it — but the moment ANY binding is used, the module is
 * included and every top-level `X.prop = y` mutation must run. In a package
 * whose components all brand themselves this way, each assignment pins its
 * component, so importing ONE export retains EVERY component: measured on
 * @pyreon/elements, importing just <Portal> paid the whole 7.5KB gz; the
 * PURE-form fix took it to 2.39KB (Element 4.02KB). The components pin each
 * other, so a single offending file taxes every SIBLING import — which is why
 * the aggregate is ALSO locked in scripts/import-budgets.json
 * (@pyreon/elements::portal / ::element) and why this guard exists per-file.
 *
 * The allowed form (identity, call sites, stack traces unchanged):
 *
 *   export default /* @__PURE__ *\/ Object.assign(Component, {
 *     displayName: name, pkgName: PKG_NAME, PYREON__COMPONENT: name,
 *   })
 *
 * Sibling of `no-bare-native-compat.test.ts` (#2368) — same mechanism, wider
 * property set. Private packages (test-utils itself) are exempt: they never
 * ship to a consumer bundle.
 */
import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')

it('published framework src has zero bare top-level brand assignments', () => {
  let out = ''
  try {
    out = execSync(
      // Top-level = column 0 (optionally the `;(X as T).y =` escape shape).
      String.raw`grep -rnE '^;?\(?[A-Za-z_$][A-Za-z0-9_$]*( as [^)]+\))?\.(displayName|pkgName|PYREON__COMPONENT|isText) = ' packages --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '/lib/' | grep -v __tests__ | grep -v '\.test\.' | grep -v 'internals/test-utils' || true`,
      { cwd: REPO, encoding: 'utf8' },
    )
  } catch {
    out = ''
  }
  const offenders = out.split('\n').filter((l) => l.trim().length > 0)
  expect(
    offenders,
    `bare top-level brand assignments pin EVERY component of the package into every consumer bundle — use the /* @__PURE__ */ Object.assign export form (see this spec's header):\n${offenders.join('\n')}`,
  ).toEqual([])
})
