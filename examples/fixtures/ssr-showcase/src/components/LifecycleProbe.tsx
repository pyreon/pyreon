import { h, onMount, onUnmount } from '@pyreon/core'

// Target of the island-lifecycle e2e (#4387): counts what a leaked island
// instance keeps doing after a client-side navigation away. `ticks` grows
// while the interval runs; `unmounts` counts `onUnmount`; `live` is the
// number of instances mounted and not yet unmounted.
interface IslandLife {
  mounts: number
  unmounts: number
  ticks: number
  live: number
}

function life(): IslandLife {
  const w = window as unknown as { __islandLife?: IslandLife }
  w.__islandLife ??= { mounts: 0, unmounts: 0, ticks: 0, live: 0 }
  return w.__islandLife
}

export default function LifecycleProbe() {
  onMount(() => {
    const l = life()
    l.mounts++
    l.live++
    const id = setInterval(() => life().ticks++, 20)
    return () => clearInterval(id)
  })
  onUnmount(() => {
    const l = life()
    l.unmounts++
    l.live--
  })
  return h('p', { 'data-testid': 'lifecycle-probe' }, 'lifecycle probe')
}
