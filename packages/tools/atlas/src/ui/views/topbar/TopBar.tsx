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
      {/* Compact: ONE row — a drawer button in place of the brand, a smaller
          view segment, an icon-only search. The desktop bar wrapped to three
          rows (163px) at phone width. */}
      <Show
        when={() => m.compact()}
        fallback={
          <C.BrandRow>
            <C.BrandMark>
              <C.BrandGlyph />
            </C.BrandMark>
            <C.Col>
              <C.BrandText>{m.title}</C.BrandText>
              {m.subtitle ? <C.BrandSub>{m.subtitle}</C.BrandSub> : null}
            </C.Col>
          </C.BrandRow>
        }
      >
        <C.IconButton
          data-testid="toggle-drawer"
          aria-label="Browse components"
          aria-expanded={() => (m.drawerOpen() ? 'true' : 'false')}
          onClick={() => m.drawerOpen.set(!m.drawerOpen())}
        >
          ☰
        </C.IconButton>
      </Show>

      <C.Segment role="tablist" aria-label="View">
        {(
          [
            ['canvas', 'Canvas'],
            ['docs', 'Docs'],
            ['lab', 'Theme Lab'],
          ] as const
        ).map(([id, label]) => (
          <C.SegBtn
            role="tab"
            data-testid={`view-${id}`}
            aria-selected={() => (m.view() === id ? 'true' : 'false')}
            state={() => (m.view() === id ? 'active' : 'idle')}
            size={() => (m.compact() ? 'small' : 'normal')}
            onClick={() => m.view.set(id)}
          >
            {label}
          </C.SegBtn>
        ))}
      </C.Segment>

      <C.SearchWrap>
        <Show when={() => !m.compact()}>
          <C.SearchTrigger data-testid="search-trigger" onClick={() => m.searchOpen.set(true)}>
            <C.SearchIcon aria-hidden="true">⌕</C.SearchIcon>
            <C.SearchTriggerText>Search components…</C.SearchTriggerText>
            <C.Kbd>⌘K</C.Kbd>
          </C.SearchTrigger>
        </Show>
      </C.SearchWrap>

      <C.RightRow>
        <Show when={() => m.compact()}>
          <C.IconButton
            data-testid="search-trigger"
            aria-label="Search components"
            onClick={() => m.searchOpen.set(true)}
          >
            ⌕
          </C.IconButton>
        </Show>
        <C.ProfileWrap>
          <C.Avatar
            data-testid="profile-btn"
            aria-label="Workspace settings"
            aria-haspopup="menu"
            aria-expanded={() => (menuOpen() ? 'true' : 'false')}
            onClick={() => menuOpen.set(!menuOpen())}
          >
            DS
          </C.Avatar>
          <Show when={() => menuOpen()}>
            <C.MenuBackdrop onClick={() => menuOpen.set(false)} />
            <C.ProfileMenu data-testid="profile-menu">
              <C.MenuLabel>Theme</C.MenuLabel>
              {THEMES.map((t) => (
                <C.MenuItem
                  state={() => (m.brandId() === t.id ? 'active' : 'idle')}
                  onClick={() => m.brandId.set(t.id)}
                >
                  {/* Contrast is monochrome — its accent flips per mode — so
                      the dot shows BOTH halves rather than a near-black dot
                      that disappeared on the dark menu. */}
                  <C.MenuSwatch
                    css={
                      t.id === 'contrast'
                        ? 'background:linear-gradient(135deg,#141824 50%,#e6e7ec 50%);'
                        : `background:${t.accent};`
                    }
                  />
                  <C.MenuItemText>{t.name}</C.MenuItemText>
                  <Show when={() => m.brandId() === t.id}>
                    <C.MenuCheck>✓</C.MenuCheck>
                  </Show>
                </C.MenuItem>
              ))}
              <C.MenuDivider />
              <C.MenuLabel>Appearance</C.MenuLabel>
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
