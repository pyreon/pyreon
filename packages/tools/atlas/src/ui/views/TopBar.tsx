/** Top bar view — brand, view/theme segments, search, dark toggle. */
import * as C from '../chrome'
import type { WorkbenchModel } from '../model'
import { THEMES } from '../theme'

export function TopBar({ model: m }: { model: WorkbenchModel }) {
  return (
    <C.TopBar>
      <C.BrandRow>
        <C.BrandMark>
          <C.BrandGlyph />
        </C.BrandMark>
        <C.Col>
          <C.BrandText>{m.title}</C.BrandText>
          {m.subtitle ? <C.BrandSub>{m.subtitle}</C.BrandSub> : null}
        </C.Col>
      </C.BrandRow>

      <C.Segment>
        <C.SegBtn state={m.view() === 'canvas' ? 'active' : 'idle'} onClick={() => m.view.set('canvas')}>Canvas</C.SegBtn>
        <C.SegBtn state={m.view() === 'docs' ? 'active' : 'idle'} onClick={() => m.view.set('docs')}>Docs</C.SegBtn>
        <C.SegBtn state={m.view() === 'lab' ? 'active' : 'idle'} onClick={() => m.view.set('lab')}>Theme Lab</C.SegBtn>
      </C.Segment>

      <C.Segment>
        {THEMES.map((t) => (
          <C.SegBtn state={m.brandId() === t.id ? 'active' : 'idle'} onClick={() => m.brandId.set(t.id)}>{t.name}</C.SegBtn>
        ))}
      </C.Segment>

      <C.SearchWrap>
        <C.SearchInner>
          <C.SearchIcon>⌕</C.SearchIcon>
          <C.SearchInput data-search onInput={(e: Event) => m.query.set((e.target as HTMLInputElement).value)} placeholder="Search components…" />
          <C.Kbd>⌘K</C.Kbd>
        </C.SearchInner>
      </C.SearchWrap>

      <C.RightRow>
        <C.IconButton onClick={() => m.dark.set(!m.dark())} title="Toggle theme">{() => (m.dark() ? '☾' : '☀')}</C.IconButton>
        <C.Avatar>DS</C.Avatar>
      </C.RightRow>
    </C.TopBar>
  )
}
