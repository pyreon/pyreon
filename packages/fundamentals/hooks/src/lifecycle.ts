import { getCurrentScope, onCleanup } from '@pyreon/reactivity'

/**
 * Register a hook's teardown so it runs when its OWNER goes away.
 *
 * Every hook in this package used to call `onCleanup` from
 * `@pyreon/reactivity` directly during component setup. That API only
 * registers inside an EFFECT RUN — it does nothing about the component:
 *
 * - A component mounted outside any reactive boundary (the app root) had its
 *   cleanup silently DROPPED: unmounting left the GPS watch, the socket, the
 *   window listener and the speech running.
 * - A component mounted inside a boundary's effect (a `<Show>`, a `<For>`
 *   row, a routed page) had its cleanup attached to THAT boundary's effect, so
 *   it ran whenever the boundary re-ran — adding one row to a `<For>` tore
 *   down the resources of every row that stayed mounted.
 *
 * During component setup the component's own `EffectScope` is current, and
 * that scope is exactly the owner: it stops when the component unmounts and at
 * no other time. Outside a component (a hook called inside a plain `effect()`,
 * or in a standalone `effectScope().runInScope`) there is no component scope
 * and the effect run is the owner, so `onCleanup` is right there.
 */
export function onHookCleanup(fn: () => void): void {
  const scope = getCurrentScope()
  if (scope) scope.add({ dispose: fn })
  else onCleanup(fn)
}
