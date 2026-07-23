/** Sidebar view — the search-filtered, grouped component list. */
import { Show } from '@pyreon/core'
import type { CatalogGroup } from '../catalog'
import * as C from '../chrome'
import type { WorkbenchModel } from '../model'

export function Sidebar({ model: m }: { model: WorkbenchModel }) {
  const group = (g: CatalogGroup) => (
    <>
      <C.GroupLabel>
        <C.GroupNum>{g.num}</C.GroupNum>
        {g.group}
      </C.GroupLabel>
      {g.items.map((c) => (
        <C.CompBtn state={m.selId() === c.id ? 'active' : 'idle'} onClick={() => m.selId.set(c.id)}>
          <C.CompBar state={m.selId() === c.id ? 'active' : 'idle'} />
          <C.CompName>{c.name}</C.CompName>
          {c.isNew ? <C.NewTag>NEW</C.NewTag> : null}
        </C.CompBtn>
      ))}
    </>
  )
  return (
    <C.Sidebar>
      <C.SideHead>
        <C.SideLabel>components</C.SideLabel>
        <C.CountPill>{m.total}</C.CountPill>
      </C.SideHead>
      <C.SideList>
        {() => m.visibleGroups().map((g) => group(g))}
        <Show when={() => m.noResults()}>
          <C.Empty>no matches</C.Empty>
        </Show>
      </C.SideList>
      <C.SideFoot>
        <C.OkDot />
        Tokens synced · ↑↓ to browse
      </C.SideFoot>
    </C.Sidebar>
  )
}
