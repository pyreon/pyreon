import { attrs, isAttrsComponent } from "@pyreon/attrs"
import { Col, Container, Row } from "@pyreon/coolgrid"
import { Element, List, Text as PText } from "@pyreon/elements"
import {
  useColorScheme,
  useDebouncedValue,
  useElementSize,
  useFocus,
  useHover,
  useInterval,
  useKeyboard,
  useMediaQuery,
  usePrevious,
  useReducedMotion,
  useToggle,
  useWindowResize,
} from "@pyreon/hooks"
import { signal } from "@pyreon/reactivity"
import rocketstyle from "@pyreon/rocketstyle"
import { config, Provider } from "@pyreon/ui-core"
import { makeItResponsive, styles } from "@pyreon/unistyle"

const { styled } = config

const theme = {
  rootSize: 16,
  breakpoints: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 },
}

// ═══════════════════════════════════════════════════════════════════════
// Styled primitives
// ═══════════════════════════════════════════════════════════════════════

const Page = styled.div`
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 24px;
  font-family: system-ui, -apple-system, sans-serif;
  color: #111;
`

const TopBadge = styled.span`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 999px;
  background: #e8f4fd;
  color: #0070f3;
  font-size: 0.75rem;
  font-weight: 600;
  margin-bottom: 8px;
`

const H1 = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  margin: 0 0 4px;
`

const Sub = styled.p`
  font-size: 1rem;
  color: #666;
  margin: 0 0 40px;
`

const H2 = styled.h2`
  font-size: 1.5rem;
  font-weight: 600;
  margin: 32px 0 16px;
  padding-top: 8px;
  border-top: 1px solid #eee;
`

const H3 = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 8px;
`

const P = styled.p`
  font-size: 0.875rem;
  color: #555;
  line-height: 1.6;
  margin: 0 0 16px;
`

const Card = styled.div`
  padding: 24px;
  border-radius: 12px;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  margin-bottom: 24px;
`

const Note = styled.div`
  font-size: 0.75rem;
  color: #888;
  margin-top: 6px;
`

const Code = styled.code`
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.85em;
  font-family: 'SF Mono', 'Fira Code', monospace;
`

const CodeBlock = styled.pre`
  background: #f4f4f5;
  border-radius: 8px;
  padding: 12px;
  font-size: 13px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  color: #333;
  line-height: 1.6;
  overflow-x: auto;
  margin: 0;
`

const FlexRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
`

const GridCell = styled.div`
  padding: 16px;
  border-radius: 8px;
  background: #e8f4fd;
  text-align: center;
  font-size: 0.875rem;
  font-weight: 500;
  color: #0070f3;
  border: 1px solid #b8daff;
`

const IconBox = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #0070f3;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
`

const Spacer = styled.div`
  height: 16px;
`

const HookBox = styled.div`
  padding: 16px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e9ecef;
  margin-bottom: 12px;
  transition: all 0.2s;
`

const Dot = styled.span`
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 8px;
`

const Btn = styled.button`
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;

  &:hover { background: #f5f5f5; }
`

const _BtnPrimary = styled.button`
  padding: 8px 16px;
  border: 1px solid #0070f3;
  border-radius: 6px;
  background: #0070f3;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;

  &:hover { background: #0060df; }
`

const Pill = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 14px;
  border-radius: 8px;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
`

// ═══════════════════════════════════════════════════════════════════════
// ATTRS DEMOS
// ═══════════════════════════════════════════════════════════════════════

const AttrBox = attrs({ name: "AttrBox", component: Element }).attrs({
  direction: "rows",
  alignX: "center",
  alignY: "center",
  block: true,
})

const AttrBadge = attrs({ name: "AttrBadge", component: Element })
  .attrs({ direction: "inline", alignX: "center", alignY: "center" })
  .attrs({ gap: 4 })

const ColorBox = attrs({ name: "ColorBox", component: Element }).attrs<{
  variant?: "primary" | "success" | "danger"
}>(((props: any) => ({
  direction: "inline" as const,
  alignX: "center" as const,
  alignY: "center" as const,
  label: { primary: "#0070f3", success: "#2ecc71", danger: "#e74c3c" }[
    (props.variant ?? "primary") as "primary" | "success" | "danger"
  ],
})) as any)

const LockedDir = attrs({ name: "LockedDir", component: Element })
  .attrs({ direction: "rows" }, { priority: true })
  .attrs({ alignX: "center", alignY: "center", gap: 8, block: true })

const FilteredBox = attrs({ name: "FilteredBox", component: Element }).attrs<{
  mood?: "happy" | "sad"
}>(
  ((props: any) => ({
    direction: "inline" as const,
    alignX: "center" as const,
    alignY: "center" as const,
    label: props.mood === "happy" ? "Happy :)" : "Sad :(",
  })) as any,
  { filter: ["mood"] },
)

const AttrCard = AttrBox.config({ name: "AttrCard" }).attrs({ gap: 8 })
const InfoCard = AttrCard.config({ name: "InfoCard" }).attrs({ gap: 12 })

const MetaBox = attrs({ name: "MetaBox", component: Element })
  .attrs({ direction: "rows", block: true })
  .statics({ category: "layout", version: "2.0", tags: ["box", "container"] })

const withBorder = (Component: any) => (props: any) => (
  <div style={{ border: "2px dashed #0070f3", borderRadius: "8px" }}>
    <Component {...props} />
  </div>
)

const withBackground = (Component: any) => (props: any) => (
  <div style={{ background: "#e8f4fd", borderRadius: "8px" }}>
    <Component {...props} />
  </div>
)

const ComposedBox = attrs({ name: "ComposedBox", component: Element })
  .attrs({ direction: "rows", alignX: "center", gap: 8, block: true })
  .compose({ withBorder, withBackground })

const BaseButton = attrs({ name: "BaseButton", component: Element }).attrs({
  direction: "inline",
  alignX: "center",
  alignY: "center",
})
const PrimaryBtn = BaseButton.config({ name: "PrimaryBtn" })
const SecondaryBtn = BaseButton.config({ name: "SecondaryBtn" })
const GhostBtn = BaseButton.config({ name: "GhostBtn" })

function AttrsSection() {
  const variant = signal<"primary" | "success" | "danger">("primary")

  return (
    <>
      <H2>Attrs</H2>
      <P>Chainable props composition for design-system primitives</P>

      <Card>
        <H3>1. Basic .attrs()</H3>
        <P>Static default props applied to Element</P>
        <AttrBox>
          <Pill style={{ background: "#0070f3" }}>A</Pill>
          <Pill style={{ background: "#e74c3c" }}>B</Pill>
          <Pill style={{ background: "#2ecc71" }}>C</Pill>
        </AttrBox>
      </Card>

      <Card>
        <H3>2. Chained .attrs()</H3>
        <P>Multiple .attrs() calls stack defaults left-to-right</P>
        <AttrBadge>
          <Pill style={{ background: "#9b59b6" }}>Tag</Pill>
          <PText>Inline badge with gap=4</PText>
        </AttrBadge>
      </Card>

      <Card>
        <H3>3. Callback attrs</H3>
        <P>Compute defaults from consumer props</P>
        <FlexRow>
          {(["primary", "success", "danger"] as const).map((v) => (
            <Btn
              onClick={() => variant.set(v)}
              style={() => ({
                background: variant() === v ? "#0070f3" : "#f0f0f0",
                color: variant() === v ? "#fff" : "#333",
              })}
            >
              {v}
            </Btn>
          ))}
        </FlexRow>
        <Spacer />
        <ColorBox variant={variant() as "primary" | "success" | "danger"}>
          <div
            style={() => ({
              width: "24px",
              height: "24px",
              borderRadius: "12px",
              marginRight: "8px",
              background: { primary: "#0070f3", success: "#2ecc71", danger: "#e74c3c" }[variant()],
            })}
          />
          <PText>{() => `variant="${variant()}"`}</PText>
        </ColorBox>
      </Card>

      <Card>
        <H3>4. Priority attrs</H3>
        <P>direction="rows" is locked — cannot be overridden by consumer</P>
        <LockedDir direction={"inline" as any}>
          <Pill style={{ background: "#f39c12" }}>1</Pill>
          <Pill style={{ background: "#1abc9c" }}>2</Pill>
          <Pill style={{ background: "#e91e63" }}>3</Pill>
        </LockedDir>
        <Note>direction="inline" was passed, but rows is locked via priority</Note>
      </Card>

      <Card>
        <H3>5. Prop filtering</H3>
        <P>"mood" prop computes label, then is stripped before forwarding</P>
        <FlexRow>
          <FilteredBox mood="happy">
            <PText>Happy</PText>
          </FilteredBox>
          <FilteredBox mood="sad">
            <PText>Sad</PText>
          </FilteredBox>
        </FlexRow>
      </Card>

      <Card>
        <H3>6. .config()</H3>
        <P>Rename or swap the base component, preserving the chain</P>
        <AttrCard>
          <PText>AttrCard (renamed from AttrBox, gap=8)</PText>
        </AttrCard>
        <Spacer />
        <InfoCard>
          <PText>InfoCard (renamed from AttrCard, gap=12)</PText>
        </InfoCard>
        <Note>AttrBox → AttrCard → InfoCard — chain inheritance preserved</Note>
      </Card>

      <Card>
        <H3>7. .statics()</H3>
        <P>Attach metadata via .meta</P>
        <CodeBlock>
          {`MetaBox.meta.category: "${MetaBox.meta.category}"\nMetaBox.meta.version: "${MetaBox.meta.version}"\nMetaBox.meta.tags: [${MetaBox.meta.tags.join(", ")}]`}
        </CodeBlock>
      </Card>

      <Card>
        <H3>8. .compose()</H3>
        <P>Wrap with HOCs (dashed border + blue background)</P>
        <ComposedBox>
          <PText>Content wrapped by two HOCs</PText>
        </ComposedBox>
      </Card>

      <Card>
        <H3>9. Immutable branching</H3>
        <P>Same base, different configs via .config()</P>
        <FlexRow>
          <PrimaryBtn>
            <Pill style={{ background: "#0070f3" }}>Primary</Pill>
          </PrimaryBtn>
          <SecondaryBtn>
            <Pill style={{ background: "#6c757d" }}>Secondary</Pill>
          </SecondaryBtn>
          <GhostBtn>
            <Pill style={{ background: "transparent", border: "1px solid #333", color: "#333" }}>
              Ghost
            </Pill>
          </GhostBtn>
        </FlexRow>
      </Card>

      <Card>
        <H3>10. isAttrsComponent()</H3>
        <P>Runtime type guard to detect attrs components</P>
        <CodeBlock>
          {`isAttrsComponent(AttrBox): ${isAttrsComponent(AttrBox)}\nisAttrsComponent(Element): ${isAttrsComponent(Element)}\nisAttrsComponent("string"): ${isAttrsComponent("string")}`}
        </CodeBlock>
      </Card>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// ROCKETSTYLE DEMOS
// ═══════════════════════════════════════════════════════════════════════

const RsBadge = rocketstyle()({ name: "RsBadge", component: Element })
  .attrs({ tag: "span", direction: "inline", alignX: "center", alignY: "center" })
  .theme({ backgroundColor: "#0070f3", color: "#fff", hover: { backgroundColor: "#0060df" } })
  .styles(
    (css) => css`
    padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 700;
    ${({ $rocketstyle: t }) => css`color: ${t.color}; background: ${t.backgroundColor};`};
  `,
  )

const StatusBadge = rocketstyle()({ name: "StatusBadge", component: Element })
  .attrs({ tag: "span", direction: "inline", alignX: "center", alignY: "center" })
  .theme({ backgroundColor: "#999", color: "#fff" })
  .states({
    success: { backgroundColor: "#2ecc71" },
    warning: { backgroundColor: "#f39c12" },
    error: { backgroundColor: "#e74c3c" },
    info: { backgroundColor: "#3498db" },
  })
  .styles(
    (css) => css`
    padding: 8px 14px; border-radius: 8px; font-size: 14px; font-weight: 700;
    ${({ $rocketstyle: t }) => css`color: ${t.color}; background: ${t.backgroundColor};`};
  `,
  )

const RsChip = rocketstyle()({ name: "RsChip", component: Element })
  .attrs({ tag: "span", direction: "inline", alignX: "center", alignY: "center" })
  .theme({
    backgroundColor: "#e0e0e0",
    color: "#333",
    paddingX: 12,
    paddingY: 6,
    fontSize: 13,
    borderRadius: 20,
  })
  .sizes({
    small: { paddingX: 8, paddingY: 4, fontSize: 11 },
    medium: { paddingX: 12, paddingY: 6, fontSize: 13 },
    large: { paddingX: 18, paddingY: 10, fontSize: 16 },
  })
  .styles(
    (css) => css`
    font-weight: 600;
    ${({ $rocketstyle: t }) => css`
      background: ${t.backgroundColor}; color: ${t.color};
      padding: ${t.paddingY}px ${t.paddingX}px; font-size: ${t.fontSize}px; border-radius: ${t.borderRadius}px;
    `};
  `,
  )

const RsButton = rocketstyle()({ name: "RsButton", component: Element })
  .attrs({ tag: "button" })
  .theme({ backgroundColor: "#0070f3", color: "#fff", hover: { backgroundColor: "#0060df" } })
  .states({
    primary: { backgroundColor: "#0070f3", color: "#fff", hover: { backgroundColor: "#0060df" } },
    secondary: { backgroundColor: "#6c757d", color: "#fff", hover: { backgroundColor: "#5c636a" } },
    outline: {
      backgroundColor: "transparent",
      color: "#0070f3",
      hover: { backgroundColor: "#e8f4fd" },
    },
    danger: { backgroundColor: "#dc3545", color: "#fff", hover: { backgroundColor: "#bb2d3b" } },
    success: { backgroundColor: "#198754", color: "#fff", hover: { backgroundColor: "#157347" } },
  })
  .sizes({
    small: { paddingX: 10, paddingY: 6, fontSize: 12 },
    medium: { paddingX: 16, paddingY: 10, fontSize: 14 },
    large: { paddingX: 24, paddingY: 14, fontSize: 18 },
  })
  .styles(
    (css) => css`
    border: none; border-radius: 6px; font-weight: 500; cursor: pointer; transition: background 0.2s;
    ${({ $rocketstyle: t }: any) => css`
      color: ${t.color}; background: ${t.backgroundColor};
      padding: ${t.paddingY ?? 10}px ${t.paddingX ?? 20}px;
      font-size: ${t.fontSize ?? 14}px;
      &:hover { background: ${t.hover?.backgroundColor}; }
    `};
  `,
  )

const RsTag = rocketstyle()({ name: "RsTag", component: Element })
  .attrs({ tag: "span", direction: "inline", alignX: "center", alignY: "center" })
  .theme({ backgroundColor: "#eee", color: "#555" })
  .states({
    new: { backgroundColor: "#e8f5e9", color: "#2e7d32" },
    hot: { backgroundColor: "#fbe9e7", color: "#d84315" },
    beta: { backgroundColor: "#e3f2fd", color: "#1565c0" },
    deprecated: { backgroundColor: "#fafafa", color: "#999" },
  })
  .styles(
    (css) => css`
    padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.5px;
    ${({ $rocketstyle: t }) => css`background: ${t.backgroundColor}; color: ${t.color};`};
  `,
  )

const UnistyleButton = rocketstyle()({ name: "UnistyleButton", component: Element })
  .attrs({ tag: "button" })
  .theme({
    height: 40,
    fontSize: 14,
    paddingX: 20,
    paddingY: 0,
    backgroundColor: "#0070f3",
    color: "#fff",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    transition: "background-color 0.2s",
    hover: { backgroundColor: "#0060df" },
  })
  .states({
    primary: { backgroundColor: "#0070f3", color: "#fff", hover: { backgroundColor: "#0060df" } },
    secondary: { backgroundColor: "#6c757d", color: "#fff", hover: { backgroundColor: "#5c636a" } },
    outline: {
      backgroundColor: "transparent",
      color: "#0070f3",
      border: "1px solid #0070f3",
      hover: { backgroundColor: "#e8f4fd" },
    },
  })
  .styles(
    (css) => css`
    font-weight: 500;
    ${({ $rocketstyle, $rocketstate: { pseudo } }) => {
      const { hover: hoverStyles, ...restStyles } = $rocketstyle
      const baseTheme = makeItResponsive({ theme: restStyles as any, styles, css })
      const hoverTheme = hoverStyles ? makeItResponsive({ theme: hoverStyles, styles, css }) : null
      return css`
        ${baseTheme};
        ${!pseudo?.disabled && css`&:hover { ${hoverTheme}; }`};
        ${pseudo?.hover && css`${hoverTheme}`};
      `
    }};
  `,
  )

function RocketstyleSection() {
  const activeState = signal<"primary" | "secondary" | "success" | "danger">("primary")

  return (
    <>
      <H2>Rocketstyle</H2>
      <P>Design-system primitives with dimensions (states, sizes, variants)</P>

      <Card>
        <H3>1. Basic Badge</H3>
        <P>.theme() sets default styling</P>
        <RsBadge>
          <span>Default Badge</span>
        </RsBadge>
      </Card>

      <Card>
        <H3>2. States dimension</H3>
        <P>.states() adds boolean prop variants</P>
        <FlexRow>
          <StatusBadge success>
            <span>Success</span>
          </StatusBadge>
          <StatusBadge warning>
            <span>Warning</span>
          </StatusBadge>
          <StatusBadge error>
            <span>Error</span>
          </StatusBadge>
          <StatusBadge info>
            <span>Info</span>
          </StatusBadge>
        </FlexRow>
      </Card>

      <Card>
        <H3>3. Sizes dimension</H3>
        <P>.sizes() adds size prop variants</P>
        <FlexRow>
          <RsChip small>
            <span>Small</span>
          </RsChip>
          <RsChip medium>
            <span>Medium</span>
          </RsChip>
          <RsChip large>
            <span>Large</span>
          </RsChip>
        </FlexRow>
      </Card>

      <Card>
        <H3>4. Combined states + sizes</H3>
        <P>Multiple dimensions applied together</P>
        <FlexRow>
          <RsButton primary small>
            <span>Primary S</span>
          </RsButton>
          <RsButton success medium>
            <span>Success M</span>
          </RsButton>
          <RsButton danger large>
            <span>Danger L</span>
          </RsButton>
        </FlexRow>
        <Spacer />
        <FlexRow>
          <RsButton secondary small>
            <span>Secondary S</span>
          </RsButton>
          <RsButton primary large>
            <span>Primary L</span>
          </RsButton>
        </FlexRow>
      </Card>

      <Card>
        <H3>5. Interactive state switch</H3>
        <P>Signal-driven state changes</P>
        {/* @ts-expect-error -- dynamic state prop accepts signal getter at runtime */}
        <RsButton state={() => activeState()} large>
          <span>{() => activeState().toUpperCase()}</span>
        </RsButton>
        <Spacer />
        <FlexRow>
          {(["primary", "secondary", "success", "danger"] as const).map((s) => (
            <Btn
              onClick={() => activeState.set(s)}
              style={() => ({
                background: activeState() === s ? "#0070f3" : "#f0f0f0",
                color: activeState() === s ? "#fff" : "#555",
              })}
            >
              {s}
            </Btn>
          ))}
        </FlexRow>
      </Card>

      <Card>
        <H3>6. Tags with states</H3>
        <P>Label states with uppercase + colors</P>
        <FlexRow>
          <RsTag new>
            <span>New</span>
          </RsTag>
          <RsTag hot>
            <span>Hot</span>
          </RsTag>
          <RsTag beta>
            <span>Beta</span>
          </RsTag>
          <RsTag deprecated>
            <span>Deprecated</span>
          </RsTag>
        </FlexRow>
      </Card>

      <Card>
        <H3>7. Rocketstyle + Unistyle</H3>
        <P>
          Data-driven CSS via <Code>makeItResponsive</Code> + <Code>styles</Code>. Theme values use
          CSS property names and are automatically converted.
        </P>
        <FlexRow>
          <UnistyleButton primary>
            <span>Primary</span>
          </UnistyleButton>
          <UnistyleButton secondary>
            <span>Secondary</span>
          </UnistyleButton>
          <UnistyleButton outline>
            <span>Outline</span>
          </UnistyleButton>
        </FlexRow>
      </Card>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// ELEMENTS DEMOS
// ═══════════════════════════════════════════════════════════════════════

function ElementsSection() {
  return (
    <>
      <H2>Elements</H2>
      <P>Foundational UI components with responsive props</P>

      <Card>
        <H3>Element — three-section flex layout</H3>
        <P>beforeContent / children / afterContent slots</P>
        <div
          style={{
            padding: "24px",
            borderRadius: "12px",
            background: "#fff",
            border: "1px solid #e9ecef",
          }}
        >
          <Element
            tag="div"
            beforeContent={<IconBox>{"\u2190"}</IconBox>}
            afterContent={<IconBox>{"\u2192"}</IconBox>}
            direction="inline"
            gap={16}
            alignY="center"
          >
            <span>Element with beforeContent and afterContent</span>
          </Element>
        </div>
        <Spacer />
        <div
          style={{
            padding: "24px",
            borderRadius: "12px",
            background: "#fff",
            border: "1px solid #e9ecef",
          }}
        >
          <Element direction="rows" gap={8}>
            <Element
              tag="div"
              beforeContent={<IconBox>1</IconBox>}
              direction="inline"
              gap={12}
              alignY="center"
            >
              <span>Row direction with nested Elements</span>
            </Element>
            <Element
              tag="div"
              beforeContent={<IconBox>2</IconBox>}
              direction="inline"
              gap={12}
              alignY="center"
            >
              <span>Each row has an icon beforeContent slot</span>
            </Element>
            <Element
              tag="div"
              beforeContent={<IconBox>3</IconBox>}
              direction="inline"
              gap={12}
              alignY="center"
            >
              <span>Composable three-section flex layout</span>
            </Element>
          </Element>
        </div>
      </Card>

      <Card>
        <H3>Text component</H3>
        <P>Semantic text rendering with paragraph/tag support</P>
        <PText tag="h4">This is an h4 via Text tag prop</PText>
        <PText paragraph>This renders as a p tag via the paragraph shorthand.</PText>
        <PText tag="strong">Bold text via tag="strong"</PText>{" "}
        <PText tag="em">Italic text via tag="em"</PText>
      </Card>

      <Card>
        <H3>List component</H3>
        <P>Data-driven list with positional metadata</P>
        <List
          component={({ children, ...rest }: any) => (
            <div
              style={{
                padding: "8px 12px",
                margin: "4px 0",
                background: rest.highlighted ? "#e8f4fd" : "#f8f9fa",
                borderRadius: "6px",
                fontSize: "14px",
                border: rest.highlighted ? "1px solid #b8daff" : "1px solid #e9ecef",
              }}
            >
              {children}
              {rest.separator && (
                <span style={{ color: "#ccc", marginLeft: "8px" }}>{"\u2502"}</span>
              )}
            </div>
          )}
          data={["Apple", "Banana", "Cherry", "Date", "Elderberry"]}
          valueName="children"
          itemProps={(_item: any, { first, last }: any) => ({
            highlighted: first,
            separator: !last,
          })}
        />
        <Note>First item highlighted, separator on all but last (positional metadata)</Note>
      </Card>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// COOLGRID DEMOS
// ═══════════════════════════════════════════════════════════════════════

function CoolgridSection() {
  return (
    <>
      <H2>Coolgrid</H2>
      <P>Responsive grid system — Container, Row, Col with context cascading</P>

      <Card>
        <H3>Responsive breakpoints</H3>
        <P>Resize the browser to see columns reflow</P>
        <Row gap={16}>
          <Col size={{ xs: 12, md: 4 }}>
            <GridCell>xs:12 md:4</GridCell>
          </Col>
          <Col size={{ xs: 12, md: 4 }}>
            <GridCell>xs:12 md:4</GridCell>
          </Col>
          <Col size={{ xs: 12, md: 4 }}>
            <GridCell>xs:12 md:4</GridCell>
          </Col>
        </Row>
        <Spacer />
        <Row gap={16}>
          <Col size={{ xs: 12, sm: 6, lg: 3 }}>
            <GridCell>xs:12 sm:6 lg:3</GridCell>
          </Col>
          <Col size={{ xs: 12, sm: 6, lg: 3 }}>
            <GridCell>xs:12 sm:6 lg:3</GridCell>
          </Col>
          <Col size={{ xs: 12, sm: 6, lg: 3 }}>
            <GridCell>xs:12 sm:6 lg:3</GridCell>
          </Col>
          <Col size={{ xs: 12, sm: 6, lg: 3 }}>
            <GridCell>xs:12 sm:6 lg:3</GridCell>
          </Col>
        </Row>
        <Spacer />
        <Row gap={16}>
          <Col size={{ xs: 12, md: 8 }}>
            <GridCell>Main (8)</GridCell>
          </Col>
          <Col size={{ xs: 12, md: 4 }}>
            <GridCell>Sidebar (4)</GridCell>
          </Col>
        </Row>
      </Card>

      <Card>
        <H3>Container with max-width</H3>
        <P>Container establishes outer grid boundary and provides config context</P>
        <Container columns={12} gap={16}>
          <Row>
            <Col size={4}>
              <GridCell>4/12</GridCell>
            </Col>
            <Col size={4}>
              <GridCell>4/12</GridCell>
            </Col>
            <Col size={4}>
              <GridCell>4/12</GridCell>
            </Col>
          </Row>
        </Container>
      </Card>

      <Card>
        <H3>Row-level size</H3>
        <P>Setting size on Row applies to all Cols inside</P>
        <Row size={6} gap={16}>
          <Col>
            <GridCell>Half</GridCell>
          </Col>
          <Col>
            <GridCell>Half</GridCell>
          </Col>
        </Row>
      </Card>

      <Card>
        <H3>Custom column count</H3>
        <P>Container with 24 columns instead of 12</P>
        <Container columns={24} gap={8}>
          <Row>
            <Col size={16}>
              <GridCell>16/24</GridCell>
            </Col>
            <Col size={8}>
              <GridCell>8/24</GridCell>
            </Col>
          </Row>
        </Container>
      </Card>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// HOOKS DEMOS
// ═══════════════════════════════════════════════════════════════════════

function HoverDemo() {
  const { hovered, props: hoverProps } = useHover()
  return (
    <HookBox
      {...hoverProps}
      style={() => ({
        borderColor: hovered() ? "#0070f3" : "#e9ecef",
        background: hovered() ? "#f0f7ff" : "#fff",
      })}
    >
      <Dot style={() => ({ background: hovered() ? "#0070f3" : "#ccc" })} />
      <Code>useHover()</Code> — {() => (hovered() ? "Hovered!" : "Hover me")}
    </HookBox>
  )
}

function FocusDemo() {
  const { focused, props: focusProps } = useFocus()
  return (
    <HookBox
      style={() => ({
        borderColor: focused() ? "#198754" : "#e9ecef",
        background: focused() ? "#f0fff4" : "#fff",
      })}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <Dot style={() => ({ background: focused() ? "#198754" : "#ccc" })} />
        <Code>useFocus()</Code> — {() => (focused() ? "Focused!" : "Click input")}
      </div>
      <input
        type="text"
        placeholder="Focus me..."
        {...focusProps}
        style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; width: 100%"
      />
    </HookBox>
  )
}

function ToggleDemo() {
  const { value, toggle, setTrue, setFalse } = useToggle(false)
  return (
    <HookBox>
      <Dot style={() => ({ background: value() ? "#0070f3" : "#ccc" })} />
      <Code>useToggle()</Code> — {() => (value() ? "ON" : "OFF")}
      <FlexRow>
        <Btn onClick={toggle}>Toggle</Btn>
        <Btn onClick={setTrue}>True</Btn>
        <Btn onClick={setFalse}>False</Btn>
      </FlexRow>
    </HookBox>
  )
}

function CounterDemo() {
  const count = signal(0)
  const prev = usePrevious(() => count())
  return (
    <HookBox>
      <Code>signal()</Code> + <Code>usePrevious()</Code>
      <div style={{ margin: "8px 0" }}>
        Current: <strong>{() => count()}</strong> | Previous:{" "}
        <strong>{() => prev() ?? "none"}</strong>
      </div>
      <FlexRow>
        <Btn onClick={() => count.update((n) => n - 1)}>-</Btn>
        <Btn onClick={() => count.set(0)}>Reset</Btn>
        <Btn onClick={() => count.update((n) => n + 1)}>+</Btn>
      </FlexRow>
    </HookBox>
  )
}

function DebouncedDemo() {
  const input = signal("")
  const debounced = useDebouncedValue(() => input(), 500)
  return (
    <HookBox>
      <Code>useDebouncedValue()</Code> — 500ms delay
      <div style={{ margin: "8px 0" }}>
        <input
          type="text"
          placeholder="Type something..."
          onInput={(e: any) => input.set(e.target.value)}
          style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; width: 100%"
        />
      </div>
      <div>
        Input: "{() => input()}" | Debounced: "{() => debounced()}"
      </div>
    </HookBox>
  )
}

function WindowResizeDemo() {
  const windowSize = useWindowResize()
  return (
    <HookBox>
      <Code>useWindowResize()</Code>
      <div style={{ margin: "4px 0" }}>
        Viewport: <strong>{() => windowSize().width}</strong> x{" "}
        <strong>{() => windowSize().height}</strong>
      </div>
    </HookBox>
  )
}

function MediaQueryDemo() {
  const isMobile = useMediaQuery("(max-width: 575px)")
  const isTablet = useMediaQuery("(min-width: 576px) and (max-width: 991px)")
  const isDesktop = useMediaQuery("(min-width: 992px)")
  return (
    <HookBox>
      <Code>useMediaQuery()</Code>
      <div style={{ margin: "4px 0" }}>
        <Dot style={() => ({ background: isMobile() ? "#e74c3c" : "#ccc" })} /> Mobile (≤575px)
      </div>
      <div style={{ margin: "4px 0" }}>
        <Dot style={() => ({ background: isTablet() ? "#f39c12" : "#ccc" })} /> Tablet (576-991px)
      </div>
      <div style={{ margin: "4px 0" }}>
        <Dot style={() => ({ background: isDesktop() ? "#2ecc71" : "#ccc" })} /> Desktop (≥992px)
      </div>
    </HookBox>
  )
}

function ColorSchemeDemo() {
  const scheme = useColorScheme()
  return (
    <HookBox>
      <Code>useColorScheme()</Code> — {() => scheme()}
      <div style={{ margin: "4px 0" }}>
        <Dot
          style={() => ({
            background: scheme() === "dark" ? "#333" : "#f5f5f5",
            border: "1px solid #999",
          })}
        />
        Your OS prefers: <strong>{() => scheme()}</strong> mode
      </div>
    </HookBox>
  )
}

function ReducedMotionDemo() {
  const reduced = useReducedMotion()
  return (
    <HookBox>
      <Code>useReducedMotion()</Code>
      <div style={{ margin: "4px 0" }}>
        <Dot style={() => ({ background: reduced() ? "#e74c3c" : "#2ecc71" })} />
        Reduced motion: <strong>{() => (reduced() ? "YES" : "NO")}</strong>
      </div>
    </HookBox>
  )
}

function KeyboardDemo() {
  const lastKey = signal("(none)")
  useKeyboard("Escape", () => lastKey.set("Escape"), undefined)
  useKeyboard("Enter", () => lastKey.set("Enter"), undefined)
  useKeyboard(" ", () => lastKey.set("Space"), undefined)
  return (
    <HookBox>
      <Code>useKeyboard()</Code> — listening for Escape, Enter, Space
      <div style={{ margin: "4px 0" }}>
        Last key pressed: <strong>{() => lastKey()}</strong>
      </div>
    </HookBox>
  )
}

function IntervalDemo() {
  const ticks = signal(0)
  const running = signal(true)
  useInterval(() => ticks.update((n) => n + 1), running() ? 1000 : null)
  return (
    <HookBox>
      <Code>useInterval()</Code> — 1s ticks
      <div style={{ margin: "4px 0" }}>
        Ticks: <strong>{() => ticks()}</strong>
      </div>
      <Btn onClick={() => running.update((v) => !v)}>{() => (running() ? "Stop" : "Start")}</Btn>
    </HookBox>
  )
}

function ElementSizeDemo() {
  let elRef: HTMLElement | null = null
  const size = useElementSize(() => elRef)
  return (
    <HookBox>
      <Code>useElementSize()</Code>
      <div
        ref={
          ((el: HTMLElement) => {
            elRef = el
          }) as any
        }
        style={{
          margin: "8px 0",
          padding: "16px",
          background: "#e8f4fd",
          borderRadius: "6px",
          resize: "both",
          overflow: "auto",
          minWidth: "100px",
          minHeight: "60px",
        }}
      >
        Resize me!
      </div>
      <div>
        Size: <strong>{() => Math.round(size().width)}</strong> x{" "}
        <strong>{() => Math.round(size().height)}</strong>
      </div>
    </HookBox>
  )
}

function HooksSection() {
  return (
    <>
      <H2>Hooks</H2>
      <P>Signal-based reactive utilities — all hooks use signal() and return reactive getters</P>

      <Card>
        <H3>Interaction</H3>
        <HoverDemo />
        <FocusDemo />
        <KeyboardDemo />
      </Card>

      <Card>
        <H3>State</H3>
        <ToggleDemo />
        <CounterDemo />
        <DebouncedDemo />
        <IntervalDemo />
      </Card>

      <Card>
        <H3>DOM & Observers</H3>
        <WindowResizeDemo />
        <ElementSizeDemo />
      </Card>

      <Card>
        <H3>Responsive & Accessibility</H3>
        <MediaQueryDemo />
        <ColorSchemeDemo />
        <ReducedMotionDemo />
      </Card>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// STYLED DEMOS
// ═══════════════════════════════════════════════════════════════════════

function StyledSection() {
  return (
    <>
      <H2>Styled Components (config.styled)</H2>
      <P>Tagged template literals via @pyreon/styler</P>

      <Card>
        <H3>Static and dynamic CSS</H3>
        <P>
          All the components on this page are created with <Code>config.styled</Code>. Supports
          static CSS, dynamic interpolations with theme/props, nested selectors, and transient props
          ($-prefixed).
        </P>
        <FlexRow>
          <TopBadge>Badge</TopBadge>
          <Code>InlineCode</Code>
          <GridCell>GridCell</GridCell>
        </FlexRow>
      </Card>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════

export function App() {
  return (
    <Provider theme={theme}>
      <Page>
        <TopBadge>Vite + @pyreon/styler</TopBadge>
        <H1>Pyreon UI System — Full Examples</H1>
        <Sub>
          Every package demonstrated: styled, attrs, rocketstyle, elements, coolgrid, unistyle, and
          hooks
        </Sub>

        <StyledSection />
        <AttrsSection />
        <RocketstyleSection />
        <ElementsSection />
        <CoolgridSection />
        <HooksSection />
      </Page>
    </Provider>
  )
}
