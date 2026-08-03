/**
 * Top bar view — brand, view segment, the ⌘K search TRIGGER (the dialog is the
 * real surface), and the profile menu (brand themes + appearance moved here
 * out of the bar, per the "configure in a profile menu" direction).
 */
import { Show } from '@pyreon/core'
import { useEventListener } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'
import { THEMES } from '../../theme'

export function TopBar(props: { model: WorkbenchModel }) {
  const m = props.model
  const menuOpen = signal(false)
  // Escape closes the menu (the invisible backdrop already handles click-away).
  useEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && menuOpen()) menuOpen.set(false)
  })

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
        <C.SegBtn state={() => (m.view() === 'canvas' ? 'active' : 'idle')} onClick={() => m.view.set('canvas')}>Canvas</C.SegBtn>
        <C.SegBtn state={() => (m.view() === 'docs' ? 'active' : 'idle')} onClick={() => m.view.set('docs')}>Docs</C.SegBtn>
        <C.SegBtn state={() => (m.view() === 'lab' ? 'active' : 'idle')} onClick={() => m.view.set('lab')}>Theme Lab</C.SegBtn>
      </C.Segment>

      <C.SearchWrap>
        <C.SearchTrigger data-testid="search-trigger" onClick={() => m.searchOpen.set(true)}>
          <C.SearchIcon>⌕</C.SearchIcon>
          <C.SearchTriggerText>Search components…</C.SearchTriggerText>
          <C.Kbd>⌘K</C.Kbd>
        </C.SearchTrigger>
      </C.SearchWrap>

      <C.RightRow>
        <C.ProfileWrap>
          <C.Avatar
            data-testid="profile-btn"
            aria-label="Workspace settings"
            onClick={() => menuOpen.set(!menuOpen())}
          >
            DS
          </C.Avatar>
          <Show when={() => menuOpen()}>
            <C.MenuBackdrop onClick={() => menuOpen.set(false)} />
            <C.ProfileMenu data-testid="profile-menu">
              <C.MenuLabel>THEME</C.MenuLabel>
              {THEMES.map((t) => (
                <C.MenuItem
                  state={() => (m.brandId() === t.id ? 'active' : 'idle')}
                  onClick={() => m.brandId.set(t.id)}
                >
                  <C.MenuSwatch css={`background:${t.accent};`} />
                  <C.MenuItemText>{t.name}</C.MenuItemText>
                  <Show when={() => m.brandId() === t.id}>
                    <C.MenuCheck>✓</C.MenuCheck>
                  </Show>
                </C.MenuItem>
              ))}
              <C.MenuDivider />
              <C.MenuLabel>APPEARANCE</C.MenuLabel>
              <C.MenuItem title="Toggle theme" onClick={() => m.dark.set(!m.dark())}>
                <C.MenuItemText>{() => (m.dark() ? 'Dark mode' : 'Light mode')}</C.MenuItemText>
                <C.MenuCheck>{() => (m.dark() ? '☾' : '☀')}</C.MenuCheck>
              </C.MenuItem>
            </C.ProfileMenu>
          </Show>
        </C.ProfileWrap>
      </C.RightRow>
    </C.TopBar>
  )
}
