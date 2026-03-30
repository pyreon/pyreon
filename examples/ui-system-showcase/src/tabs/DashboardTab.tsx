import { Col, Container, Row } from "@pyreon/coolgrid";
import { useHover } from "@pyreon/hooks";
import type { signal } from "@pyreon/reactivity";
import { FadeIn, SlideUp } from "../animations";
import { RsBadge } from "../components";
import { Card, Code, Divider, FlexRow, SectionDesc, SectionTitle } from "../primitives";

// ─── Dashboard Tab ───────────────────────────────────────────────────────────

export function DashboardTab(props: {
  stats: Array<{ label: string; value: string; change: string; trend: string }>;
  filteredItems: () => Array<{
    name: string;
    pkg: string;
    status: string;
  }>;
  searchInput: ReturnType<typeof signal<string>>;
  debouncedSearch: () => string;
}) {
  return (
    <div>
      {/* Stats grid with animated cards */}
      <Container>
        <Row>
          {props.stats.map((stat) => (
            <Col size={[12, 6, 3]}>
              <SlideUp appear show={() => true}>
                <StatCard stat={stat} />
              </SlideUp>
            </Col>
          ))}
        </Row>
      </Container>

      <Divider />

      {/* Search + filtered list */}
      <SectionTitle style={{ fontSize: "18px" }}>Component Registry</SectionTitle>
      <SectionDesc>
        Search with debounced input (<Code>useDebouncedValue</Code>)
      </SectionDesc>

      <input
        type="text"
        placeholder="Search components..."
        value={props.searchInput}
        onInput={(e: Event) => props.searchInput.set((e.target as HTMLInputElement).value)}
        style={{
          width: "100%",
          maxWidth: "400px",
          padding: "10px 14px",
          borderRadius: "6px",
          border: "1px solid var(--border)",
          background: "var(--bg-surface)",
          color: "var(--text)",
          fontSize: "14px",
          marginBottom: "16px",
          outline: "none",
        }}
      />

      <div
        style={{
          fontSize: "12px",
          color: "var(--text-muted)",
          marginBottom: "12px",
        }}
      >
        {() =>
          `Showing ${props.filteredItems().length} items (debounced: "${props.debouncedSearch()}")`
        }
      </div>

      {/* List component from @pyreon/elements */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {() =>
          props.filteredItems().map((item) => (
            <FadeIn appear show={() => true}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                }}
              >
                <FlexRow>
                  <span style={{ fontWeight: "600" }}>{item.name}</span>
                  <Code>@pyreon/{item.pkg}</Code>
                </FlexRow>
                <RsBadge success>
                  <span>{item.status}</span>
                </RsBadge>
              </div>
            </FadeIn>
          ))
        }
      </div>
    </div>
  );
}

// ─── Stat Card (useHover + Element) ──────────────────────────────────────────

function StatCard(props: {
  stat: { label: string; value: string; change: string; trend: string };
}) {
  const { hovered, props: hoverProps } = useHover();

  const trendColors: Record<string, string> = {
    up: "var(--success)",
    down: "var(--danger)",
    flat: "var(--text-muted)",
  };

  return (
    <Card
      {...hoverProps}
      style={() => ({
        transform: hovered() ? "translateY(-2px)" : "none",
        boxShadow: hovered() ? "var(--shadow-lg)" : "var(--shadow)",
        marginBottom: "16px",
      })}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <span
          style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {props.stat.label}
        </span>
        <span style={{ fontSize: "28px", fontWeight: "700" }}>{props.stat.value}</span>
        <span
          style={{
            fontSize: "13px",
            color: trendColors[props.stat.trend],
          }}
        >
          {props.stat.change}
        </span>
      </div>
    </Card>
  );
}
