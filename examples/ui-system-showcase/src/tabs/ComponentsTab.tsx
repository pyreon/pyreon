import { Col, Container, Row } from "@pyreon/coolgrid";
import { Element, List, Text } from "@pyreon/elements";
import { FadeIn } from "../animations";
import { DangerButton, GhostButton, PrimaryButton, RsBadge, RsButton } from "../components";
import { addNotification } from "../notifications";
import { Badge, Card, Code, FlexRow, SectionDesc, SectionTitle } from "../primitives";

// ─── Components Tab ──────────────────────────────────────────────────────────

export function ComponentsTab() {
  return (
    <div>
      <FadeIn appear show={() => true}>
        {/* Rocketstyle buttons */}
        <Card style={{ marginBottom: "24px" }}>
          <SectionTitle style={{ fontSize: "18px" }}>Rocketstyle Buttons</SectionTitle>
          <SectionDesc>
            Design-system primitives with <Code>.theme()</Code>, <Code>.states()</Code>,{" "}
            <Code>.sizes()</Code>
          </SectionDesc>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <FlexRow>
              <RsButton>
                <span>Default</span>
              </RsButton>
              <RsButton success>
                <span>Success</span>
              </RsButton>
              <RsButton danger>
                <span>Danger</span>
              </RsButton>
              <RsButton warning>
                <span>Warning</span>
              </RsButton>
            </FlexRow>

            <FlexRow>
              <RsButton sm>
                <span>Small</span>
              </RsButton>
              <RsButton md>
                <span>Medium</span>
              </RsButton>
              <RsButton lg>
                <span>Large</span>
              </RsButton>
            </FlexRow>

            <FlexRow>
              <RsButton success sm>
                <span>Success SM</span>
              </RsButton>
              <RsButton danger lg>
                <span>Danger LG</span>
              </RsButton>
              <RsButton warning md>
                <span>Warning MD</span>
              </RsButton>
            </FlexRow>
          </div>
        </Card>

        {/* Rocketstyle badges */}
        <Card style={{ marginBottom: "24px" }}>
          <SectionTitle style={{ fontSize: "18px" }}>Rocketstyle Badges</SectionTitle>
          <SectionDesc>Same dimension pattern for badges</SectionDesc>
          <FlexRow>
            <RsBadge>
              <span>Default</span>
            </RsBadge>
            <RsBadge success>
              <span>Success</span>
            </RsBadge>
            <RsBadge danger>
              <span>Danger</span>
            </RsBadge>
            <RsBadge warning>
              <span>Warning</span>
            </RsBadge>
          </FlexRow>
        </Card>

        {/* Attrs composition */}
        <Card style={{ marginBottom: "24px" }}>
          <SectionTitle style={{ fontSize: "18px" }}>Attrs Composition</SectionTitle>
          <SectionDesc>
            Chainable <Code>.attrs()</Code> for default props
          </SectionDesc>
          <FlexRow>
            <PrimaryButton onClick={() => addNotification("Primary clicked!", "info")}>
              <span>Primary (attrs)</span>
            </PrimaryButton>
            <DangerButton onClick={() => addNotification("Danger clicked!", "danger")}>
              <span>Danger (attrs)</span>
            </DangerButton>
            <GhostButton onClick={() => addNotification("Ghost clicked!", "success")}>
              <span>Ghost (attrs)</span>
            </GhostButton>
          </FlexRow>
        </Card>

        {/* Element layouts */}
        <Card style={{ marginBottom: "24px" }}>
          <SectionTitle style={{ fontSize: "18px" }}>Element Layouts</SectionTitle>
          <SectionDesc>
            Three-section flex: <Code>beforeContent</Code> | children | <Code>afterContent</Code>
          </SectionDesc>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <UserRow
              initial="A"
              color="var(--primary)"
              name="Alice Johnson"
              jobRole="Frontend Engineer"
              statusText="online"
              statusState="success"
            />
            <UserRow
              initial="B"
              color="var(--success)"
              name="Bob Smith"
              jobRole="UI Designer"
              statusText="away"
              statusState="warning"
            />
          </div>
        </Card>

        {/* Responsive grid */}
        <Card style={{ marginBottom: "24px" }}>
          <SectionTitle style={{ fontSize: "18px" }}>Responsive Grid</SectionTitle>
          <SectionDesc>
            <Code>Container</Code> / <Code>Row</Code> / <Code>Col</Code> with breakpoint-responsive
            sizes
          </SectionDesc>
          <Container>
            <Row>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <Col size={[12, 6, 4]}>
                  <div
                    style={{
                      padding: "16px",
                      background: "var(--bg-surface)",
                      borderRadius: "6px",
                      textAlign: "center",
                      fontWeight: "600",
                      marginBottom: "8px",
                    }}
                  >
                    Col {n}
                  </div>
                </Col>
              ))}
            </Row>
          </Container>
        </Card>

        {/* Text & List */}
        <Card>
          <SectionTitle style={{ fontSize: "18px" }}>Text & List</SectionTitle>
          <SectionDesc>Data-driven rendering with positional metadata</SectionDesc>
          <List
            data={[
              "useHover — interaction tracking",
              "useToggle — boolean state management",
              "useColorScheme — OS theme detection",
              "useMediaQuery — responsive breakpoints",
              "useKeyboard — keyboard shortcuts",
            ]}
            component={ListItem}
          />
        </Card>
      </FadeIn>
    </div>
  );
}

// ─── Element User Row ────────────────────────────────────────────────────────

function UserRow(props: {
  initial: string;
  color: string;
  name: string;
  jobRole: string;
  statusText: string;
  statusState: string;
}) {
  return (
    <Element
      tag="div"
      direction="inline"
      gap={12}
      alignY="center"
      beforeContent={
        <span
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: props.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: "14px",
          }}
        >
          {props.initial}
        </span>
      }
      afterContent={
        <Badge
          style={{
            background: props.statusState === "success" ? "var(--success)" : "var(--warning)",
            color: "#fff",
          }}
        >
          {props.statusText}
        </Badge>
      }
    >
      <div>
        <span style={{ fontWeight: "600", display: "block" }}>{props.name}</span>
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{props.jobRole}</span>
      </div>
    </Element>
  );
}

// ─── List Item ───────────────────────────────────────────────────────────────

function ListItem(props: {
  children?: any;
  index?: number;
  first?: boolean;
  last?: boolean;
  odd?: boolean;
  position?: number;
}) {
  return (
    <div
      style={{
        padding: "10px 14px",
        background: props.odd ? "var(--bg-surface)" : "var(--bg-card)",
        borderRadius: props.first ? "6px 6px 0 0" : props.last ? "0 0 6px 6px" : "0",
        borderBottom: props.last ? "none" : "1px solid var(--border)",
        display: "flex",
        gap: "8px",
        alignItems: "center",
      }}
    >
      <span
        style={{
          color: "var(--primary)",
          fontWeight: "600",
          minWidth: "20px",
        }}
      >
        {props.position}
      </span>
      <Text tag="span">{props.children}</Text>
    </div>
  );
}
