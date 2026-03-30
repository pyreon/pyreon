import { attrs } from "@pyreon/attrs";
import { rocketstyle } from "@pyreon/rocketstyle";
import { Badge, Btn } from "./primitives";

// ─── Base button component ───────────────────────────────────────────────────

export const BaseButton = (props: {
  label?: string | undefined;
  children?: any;
  style?: any;
  onClick?: (() => void) | undefined;
  type?: string | undefined;
  [key: string]: any;
}) => (
  <Btn
    type={(props.type ?? "button") as "button" | "submit" | "reset"}
    style={props.style}
    onClick={props.onClick}
  >
    {props.children ?? props.label}
  </Btn>
);

// ─── Attrs components ────────────────────────────────────────────────────────

export const PrimaryButton = attrs({ name: "PrimaryButton", component: BaseButton }).attrs({
  style: { background: "var(--primary)", color: "#fff" },
} as any);

export const DangerButton = attrs({ name: "DangerButton", component: BaseButton }).attrs({
  style: { background: "var(--danger)", color: "#fff" },
} as any);

export const GhostButton = attrs({ name: "GhostButton", component: BaseButton }).attrs({
  style: {
    background: "transparent",
    color: "var(--text)",
    border: "1px solid var(--border)",
  },
} as any);

// ─── Rocketstyle components ─────────────────────────────────────────────────

export const RsButton = rocketstyle()({ name: "RsButton", component: BaseButton })
  .attrs({ type: "button" })
  .theme({
    backgroundColor: "var(--primary)",
    color: "#fff",
    hover: { backgroundColor: "var(--primary-hover)" },
  })
  .states({
    success: { backgroundColor: "var(--success)", color: "#fff" },
    danger: { backgroundColor: "var(--danger)", color: "#fff" },
    warning: { backgroundColor: "var(--warning)", color: "#000" },
  })
  .sizes({
    sm: { paddingX: 8, paddingY: 4, fontSize: 12 },
    md: { paddingX: 16, paddingY: 8, fontSize: 14 },
    lg: { paddingX: 24, paddingY: 12, fontSize: 16 },
  })
  .styles((({ $rocketstyle: t }: any) => ({
    style: {
      background: t.backgroundColor,
      color: t.color,
      paddingLeft: `${t.paddingX ?? 16}px`,
      paddingRight: `${t.paddingX ?? 16}px`,
      paddingTop: `${t.paddingY ?? 8}px`,
      paddingBottom: `${t.paddingY ?? 8}px`,
      fontSize: `${t.fontSize ?? 14}px`,
    },
  })) as any);

export const RsBadge = rocketstyle()({ name: "RsBadge", component: Badge })
  .theme({ backgroundColor: "var(--primary)", color: "#fff" })
  .states({
    success: { backgroundColor: "var(--success)", color: "#fff" },
    danger: { backgroundColor: "var(--danger)", color: "#fff" },
    warning: { backgroundColor: "var(--warning)", color: "#000" },
  })
  .styles((({ $rocketstyle: t }: any) => ({
    style: { background: t.backgroundColor, color: t.color },
  })) as any);
