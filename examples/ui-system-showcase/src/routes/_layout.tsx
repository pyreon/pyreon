import type { Props } from '@pyreon/core'
import {
  useColorScheme,
  useIntersection,
  useKeyboard,
  useMediaQuery,
  useReducedMotion,
  useScrollLock,
  useToggle,
  useWindowResize,
} from '@pyreon/hooks'
import { computed } from '@pyreon/reactivity'
import { RouterLink, RouterView, useIsActive } from '@pyreon/router'
import { PyreonUI } from '@pyreon/ui-core'
import { HeroFade, NotifFade } from '../animations'
import { GhostButton, PrimaryButton } from '../components'
import { ModalOverlay } from '../ModalOverlay'
import { addNotification, notifications, removeNotification } from '../notifications'
import {
  Badge,
  Btn,
  Code,
  FlexRow,
  Header,
  Logo,
  Page,
  Section,
  SectionDesc,
  SectionTitle,
} from '../primitives'
import { darkTheme, lightTheme } from '../theme'

const baseTheme = {
  rootSize: 16,
  breakpoints: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 },
}

function TabLink(props: { path: string; label: string }) {
  const isActive = useIsActive(props.path, true)
  return (
    <RouterLink to={props.path} style="text-decoration: none;">
      <Btn
        type="button"
        style={() => ({
          background: isActive() ? 'var(--primary)' : 'var(--bg-surface)',
          color: isActive() ? '#fff' : 'var(--text)',
        })}
      >
        {props.label}
      </Btn>
    </RouterLink>
  )
}

export function layout(_props: Props) {
  const systemScheme = useColorScheme()
  const darkMode = useToggle(false)
  const theme = computed(() => (darkMode.value() ? darkTheme : lightTheme))

  const windowSize = useWindowResize()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const reducedMotion = useReducedMotion()

  const scrollLock = useScrollLock()
  const modalOpen = useToggle(false)

  useKeyboard(
    'Escape',
    () => {
      if (modalOpen.value()) {
        modalOpen.setFalse()
        scrollLock.unlock()
      }
    },
    undefined,
  )

  useKeyboard(
    'n',
    (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      addNotification('Keyboard shortcut triggered!', 'info')
    },
    undefined,
  )

  let heroRef: HTMLElement | null = null
  const heroEntry = useIntersection(() => heroRef, { threshold: 0.5 })
  const _heroVisible = computed(
    () => (heroEntry() as IntersectionObserverEntry | null)?.isIntersecting ?? true,
  )

  return (
    <PyreonUI theme={baseTheme} mode="system">
      <Page style={theme}>
        <Header>
          <FlexRow>
            <Logo>Pyreon UI</Logo>
            <Badge style={{ background: 'var(--primary)', color: '#fff' }}>showcase</Badge>
          </FlexRow>
          <FlexRow>
            <Code>{() => `${windowSize().width}x${windowSize().height}`}</Code>
            <Badge
              style={() => ({
                background: isMobile() ? 'var(--warning)' : 'var(--success)',
                color: isMobile() ? '#000' : '#fff',
              })}
            >
              {() => (isMobile() ? 'mobile' : 'desktop')}
            </Badge>
            <Badge
              style={() => ({
                background: reducedMotion() ? 'var(--danger)' : 'var(--bg-surface)',
                color: reducedMotion() ? '#fff' : 'var(--text)',
              })}
            >
              {() => (reducedMotion() ? 'reduced motion' : 'animations on')}
            </Badge>
            <Btn
              type="button"
              style={{ background: 'var(--bg-surface)', color: 'var(--text)' }}
              onClick={() => darkMode.toggle()}
            >
              {() => (darkMode.value() ? 'Light' : 'Dark')}
            </Btn>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {() => `System: ${systemScheme()}`}
            </span>
          </FlexRow>
        </Header>

        {/* Notifications */}
        <div
          style={{
            position: 'fixed',
            top: '72px',
            right: '16px',
            zIndex: '200',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxWidth: '320px',
          }}
        >
          {() =>
            notifications().map((notif) => {
              const colors: Record<string, string> = {
                info: 'var(--primary)',
                success: 'var(--success)',
                danger: 'var(--danger)',
              }
              return (
                <NotifFade
                  key={notif.id}
                  appear
                  show={() => true}
                  style={{
                    background: 'var(--bg-card)',
                    border: `2px solid ${colors[notif.type]}`,
                    borderRadius: '8px',
                    padding: '12px 16px',
                    boxShadow: 'var(--shadow-lg)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: colors[notif.type],
                      flexShrink: '0',
                    }}
                  />
                  <span style={{ flex: '1' }}>{notif.message}</span>
                  <button
                    type="button"
                    onClick={() => removeNotification(notif.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      fontSize: '16px',
                    }}
                  >
                    x
                  </button>
                </NotifFade>
              )
            })
          }
        </div>

        {/* Hero */}
        <div ref={(el: HTMLElement) => { heroRef = el }}>
          <HeroFade appear show={() => true}>
            <Section>
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <SectionTitle style={{ fontSize: '36px', marginBottom: '16px' }}>
                  Full-Stack UI System
                </SectionTitle>
                <SectionDesc
                  style={{ fontSize: '16px', maxWidth: '600px', margin: '0 auto 24px' }}
                >
                  All 10 packages working together: styling, animations, responsive grids, hooks,
                  elements, and design-system primitives.
                </SectionDesc>
                <FlexRow style={{ justifyContent: 'center' }}>
                  <PrimaryButton
                    onClick={() => addNotification('Welcome to the showcase!', 'success')}
                  >
                    <span>Try notification</span>
                  </PrimaryButton>
                  <GhostButton
                    onClick={() => {
                      modalOpen.setTrue()
                      scrollLock.lock()
                    }}
                  >
                    <span>Open modal</span>
                  </GhostButton>
                </FlexRow>
                <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Press <Code>n</Code> for notification, <Code>Esc</Code> to close modal
                </div>
              </div>
            </Section>
          </HeroFade>
        </div>

        {/* Tab navigation */}
        <Section>
          <FlexRow style={{ marginBottom: '24px' }}>
            <TabLink path="/" label="Dashboard" />
            <TabLink path="/components" label="Components" />
            <TabLink path="/hooks" label="Hooks" />
          </FlexRow>

          <RouterView />
        </Section>

        {/* Modal */}
        {() =>
          modalOpen.value() && (
            <ModalOverlay
              onClose={() => {
                modalOpen.setFalse()
                scrollLock.unlock()
              }}
            />
          )
        }
      </Page>
    </PyreonUI>
  )
}
