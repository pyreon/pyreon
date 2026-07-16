/**
 * Whole-class guard: NO bare module-level `nativeCompat(X)` statements in
 * framework source.
 *
 * A bare statement is an unremovable side effect once a built lib
 * concatenates modules into a shared chunk (`sideEffects: false` only drops
 * whole files) — it RETAINS the component body in every consumer bundle that
 * never imports it. Measured on the krausest bench bundle: ~1.2KB gz of dead
 * transition machinery from three such statements in runtime-dom alone.
 *
 * The allowed form is the PURE assignment (marker semantics identical —
 * `nativeCompat` returns the SAME fn):
 *
 *   const _X = /* @__PURE__ *\/ nativeCompat(X)
 *   export { _X as X }
 *
 * (or `export default /* @__PURE__ *\/ nativeCompat(X)` / marking at an
 * existing export-site expression). Function-scoped calls (e.g. the compat
 * layers marking per-instance Providers inside `createContext`) are fine —
 * this guard only matches column-0 statements.
 *
 * Bisect-verified: reintroducing `nativeCompat(Toaster)` as a bare statement
 * fails this spec naming the file; removed → passes.
 */
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname ?? __dirname, '../../../../..')

it('framework src contains zero bare module-level nativeCompat statements', () => {
  let out = ''
  try {
    out = execSync(
      `grep -rn '^nativeCompat(' packages --include='*.ts' --include='*.tsx' | grep -v '/tests/' | grep -v '.test.' | grep -v '/lib/' || true`,
      { cwd: REPO_ROOT, encoding: 'utf8' },
    )
  } catch {
    out = ''
  }
  const offenders = out
    .split('\n')
    .filter((l) => l.trim().length > 0)
  expect(
    offenders,
    `bare module-level nativeCompat(X) statements retain dead component bodies in consumer bundles — use the /* @__PURE__ */ assignment form (see this spec's header):\n${offenders.join('\n')}`,
  ).toEqual([])
})
