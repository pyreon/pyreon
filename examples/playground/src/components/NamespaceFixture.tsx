/**
 * Fixture for the v3 namespace-import verify-modes assertion. Same
 * shape as DeferredFixture but used via `import * as NS` from About.tsx:
 *
 *     import * as NS from '../components/NamespaceFixture'
 *     <Defer when={open}><NS.NamespaceFixture /></Defer>
 *
 * The compiler should rewrite to:
 *     <Defer chunk={() => import('...').then((__m) => ({ default: __m.NamespaceFixture }))}>
 *       {(__C) => <__C />}
 *     </Defer>
 *
 * The fingerprint `DEFER_NAMESPACE_FIXTURE_MARKER_QRS456` lives only in
 * this file — verify-modes asserts it lands in `NamespaceFixture-*.js`,
 * not the route chunk. If gap 4 regressed, the static `import * as NS`
 * would survive and Rolldown would static-bundle the fixture, dropping
 * the fingerprint into `about-*.js` instead.
 */
export function NamespaceFixture(): JSX.Element {
  return <div data-testid="namespace-fixture">DEFER_NAMESPACE_FIXTURE_MARKER_QRS456</div>
}
