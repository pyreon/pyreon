import type { PropertyValue } from "../../types";
import value from "../../units/value";

const isValidValue = (v: unknown) => !!v || v === 0;

type SideValues = {
  top: PropertyValue | null | undefined;
  left: PropertyValue | null | undefined;
  right: PropertyValue | null | undefined;
  bottom: PropertyValue | null | undefined;
  x: PropertyValue | null | undefined;
  y: PropertyValue | null | undefined;
  full: PropertyValue | null | undefined;
};

// top - right - bottom - left
const resolveSides = ({ top, left, right, bottom, x, y, full }: SideValues) => {
  const sides = [full, full, full, full];

  if (isValidValue(x)) {
    sides[1] = x;
    sides[3] = x;
  }

  if (isValidValue(y)) {
    sides[0] = y;
    sides[2] = y;
  }

  if (isValidValue(top)) sides[0] = top;
  if (isValidValue(right)) sides[1] = right;
  if (isValidValue(bottom)) sides[2] = bottom;
  if (isValidValue(left)) sides[3] = left;

  return sides;
};

const formatSpacing = (property: string, sides: (PropertyValue | null | undefined)[]) => {
  const [t, r, b, l] = sides;

  if (sides.every((val, _, arr) => isValidValue(val) && val === arr[0]))
    return `${property}: ${t};`;

  if (t === b && r === l) return `${property}: ${value(t)} ${value(r)};`;

  if (t && r === l && b) return `${property}: ${value(t)} ${value(r)} ${value(b)};`;

  if (sides.every((val) => !!val))
    return `${property}: ${value(t)} ${value(r)} ${value(b)} ${value(l)};`;

  let output = "";
  if (t) output += `${property}-top: ${value(t)};`;
  if (b) output += `${property}-bottom: ${value(b)};`;
  if (l) output += `${property}-left: ${value(l)};`;
  if (r) output += `${property}-right: ${value(r)};`;

  return output;
};

export type SpacingShorthand = (property: "padding" | "margin") => (props: SideValues) => string;

export const spacingShorthand: SpacingShorthand = (property) => (props) =>
  formatSpacing(property, resolveSides(props));
