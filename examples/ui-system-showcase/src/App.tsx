import {
  useColorScheme,
  useDebouncedValue,
  useIntersection,
  useKeyboard,
  useMediaQuery,
  useReducedMotion,
  useScrollLock,
  useToggle,
  useWindowResize,
} from "@pyreon/hooks";
import { computed, signal } from "@pyreon/reactivity";
import { HeroFade, NotifFade } from "./animations";
import { GhostButton, PrimaryButton } from "./components";
import { ModalOverlay } from "./ModalOverlay";
import { addNotification, notifications, removeNotification } from "./notifications";
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
} from "./primitives";
import { ComponentsTab } from "./tabs/ComponentsTab";
import { DashboardTab } from "./tabs/DashboardTab";
import { HooksTab } from "./tabs/HooksTab";
import { darkTheme, lightTheme } from "./theme";

export function App() {
  // Theme (useColorScheme + useToggle)
  const systemScheme = useColorScheme();
  const darkMode = useToggle(false);
  const theme = computed(() => (darkMode.value() ? darkTheme : lightTheme));

  // Responsive (useWindowResize + useMediaQuery + useReducedMotion)
  const windowSize = useWindowResize();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const reducedMotion = useReducedMotion();

  // Search with debounce (useDebouncedValue)
  const searchInput = signal("");
  const debouncedSearch = useDebouncedValue(() => searchInput(), 300);

  // Tabs
  const activeTab = signal<"dashboard" | "components" | "hooks">("dashboard");

  // Scroll lock + modal (useScrollLock + useToggle)
  const scrollLock = useScrollLock();
  const modalOpen = useToggle(false);

  // Keyboard shortcuts (useKeyboard)
  useKeyboard(
    "Escape",
    () => {
      if (modalOpen.value()) {
        modalOpen.setFalse();
        scrollLock.unlock();
      }
    },
    undefined,
  );

  useKeyboard(
    "n",
    (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      addNotification("Keyboard shortcut triggered!", "info");
    },
    undefined,
  );

  // Section visibility (useIntersection)
  let heroRef: HTMLElement | null = null;
  const heroEntry = useIntersection(() => heroRef, { threshold: 0.5 });
  const _heroVisible = computed(
    () => (heroEntry() as IntersectionObserverEntry | null)?.isIntersecting ?? true,
  );

  // Dashboard data
  const stats = [
    { label: "Components", value: "10", change: "+2", trend: "up" },
    { label: "Hooks", value: "25+", change: "+5", trend: "up" },
    { label: "Presets", value: "122", change: "stable", trend: "flat" },
    { label: "Bundle", value: "~8kb", change: "-12%", trend: "down" },
  ];

  const recentItems = [
    { name: "Button", pkg: "rocketstyle", status: "stable" },
    { name: "Element", pkg: "elements", status: "stable" },
    { name: "fade", pkg: "kinetic", status: "stable" },
    { name: "useHover", pkg: "hooks", status: "stable" },
    { name: "Container", pkg: "coolgrid", status: "stable" },
    { name: "styled", pkg: "styler", status: "stable" },
  ];

  const filteredItems = computed(() => {
    const q = debouncedSearch().toLowerCase();
    if (!q) return recentItems;
    return recentItems.filter(
      (item) => item.name.toLowerCase().includes(q) || item.pkg.toLowerCase().includes(q),
    );
  });

  return (
    <Page style={theme}>
      {/* ── Header ──────────────────────────────────────── */}
      <Header>
        <FlexRow>
          <Logo>Pyreon UI</Logo>
          <Badge style={{ background: "var(--primary)", color: "#fff" }}>showcase</Badge>
        </FlexRow>
        <FlexRow>
          <Code>{() => `${windowSize().width}x${windowSize().height}`}</Code>
          <Badge
            style={() => ({
              background: isMobile() ? "var(--warning)" : "var(--success)",
              color: isMobile() ? "#000" : "#fff",
            })}
          >
            {() => (isMobile() ? "mobile" : "desktop")}
          </Badge>
          <Badge
            style={() => ({
              background: reducedMotion() ? "var(--danger)" : "var(--bg-surface)",
              color: reducedMotion() ? "#fff" : "var(--text)",
            })}
          >
            {() => (reducedMotion() ? "reduced motion" : "animations on")}
          </Badge>
          <Btn
            type="button"
            style={{
              background: "var(--bg-surface)",
              color: "var(--text)",
            }}
            onClick={() => darkMode.toggle()}
          >
            {() => (darkMode.value() ? "Light" : "Dark")}
          </Btn>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            {() => `System: ${systemScheme()}`}
          </span>
        </FlexRow>
      </Header>

      {/* ── Notifications (kinetic + hooks) ─────────────── */}
      <div
        style={{
          position: "fixed",
          top: "72px",
          right: "16px",
          zIndex: "200",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          maxWidth: "320px",
        }}
      >
        {() =>
          notifications().map((notif) => {
            const colors: Record<string, string> = {
              info: "var(--primary)",
              success: "var(--success)",
              danger: "var(--danger)",
            };
            return (
              <NotifFade
                key={notif.id}
                appear
                show={() => true}
                style={{
                  background: "var(--bg-card)",
                  border: `2px solid ${colors[notif.type]}`,
                  borderRadius: "8px",
                  padding: "12px 16px",
                  boxShadow: "var(--shadow-lg)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "13px",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: colors[notif.type],
                    flexShrink: "0",
                  }}
                />
                <span style={{ flex: "1" }}>{notif.message}</span>
                <button
                  type="button"
                  onClick={() => removeNotification(notif.id)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    fontSize: "16px",
                  }}
                >
                  x
                </button>
              </NotifFade>
            );
          })
        }
      </div>

      {/* ── Hero (kinetic compose + intersection) ───────── */}
      <div
        // @ts-expect-error -- Pyreon supports callback refs at runtime but built types expect { current }
        ref={(el: HTMLElement) => {
          heroRef = el;
        }}
      >
        <HeroFade appear show={() => true}>
          <Section>
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <SectionTitle style={{ fontSize: "36px", marginBottom: "16px" }}>
                Full-Stack UI System
              </SectionTitle>
              <SectionDesc
                style={{
                  fontSize: "16px",
                  maxWidth: "600px",
                  margin: "0 auto 24px",
                }}
              >
                All 10 packages working together: styling, animations, responsive grids, hooks,
                elements, and design-system primitives.
              </SectionDesc>
              <FlexRow style={{ justifyContent: "center" }}>
                <PrimaryButton
                  onClick={() => addNotification("Welcome to the showcase!", "success")}
                >
                  <span>Try notification</span>
                </PrimaryButton>
                <GhostButton
                  onClick={() => {
                    modalOpen.setTrue();
                    scrollLock.lock();
                  }}
                >
                  <span>Open modal</span>
                </GhostButton>
              </FlexRow>
              <div
                style={{
                  marginTop: "12px",
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                Press <Code>n</Code> for notification, <Code>Esc</Code> to close modal
              </div>
            </div>
          </Section>
        </HeroFade>
      </div>

      {/* ── Tab navigation ──────────────────────────────── */}
      <Section>
        <FlexRow style={{ marginBottom: "24px" }}>
          {(["dashboard", "components", "hooks"] as const).map((tab) => (
            <Btn
              type="button"
              style={() => ({
                background: activeTab() === tab ? "var(--primary)" : "var(--bg-surface)",
                color: activeTab() === tab ? "#fff" : "var(--text)",
              })}
              onClick={() => activeTab.set(tab)}
            >
              {tab[0].toUpperCase() + tab.slice(1)}
            </Btn>
          ))}
        </FlexRow>

        {/* ── Dashboard tab (coolgrid + kinetic stagger) */}
        {() =>
          activeTab() === "dashboard" && (
            <DashboardTab
              stats={stats}
              filteredItems={filteredItems}
              searchInput={searchInput}
              debouncedSearch={debouncedSearch}
            />
          )
        }

        {/* ── Components tab (rocketstyle + attrs + elements) */}
        {() => activeTab() === "components" && <ComponentsTab />}

        {/* ── Hooks tab */}
        {() => activeTab() === "hooks" && <HooksTab />}
      </Section>

      {/* ── Modal (kinetic + useScrollLock + useKeyboard) */}
      {() =>
        modalOpen.value() && (
          <ModalOverlay
            onClose={() => {
              modalOpen.setFalse();
              scrollLock.unlock();
            }}
          />
        )
      }
    </Page>
  );
}
