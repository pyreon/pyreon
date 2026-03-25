import { value } from "../../units"

type CssUnits =
  | "px"
  | "rem"
  | "%"
  | "em"
  | "ex"
  | "cm"
  | "mm"
  | "in"
  | "pt"
  | "pc"
  | "ch"
  | "vh"
  | "vw"
  | "vmin"
  | "vmax"

const isValidValue = (v: unknown) => !!v || v === 0

type Property = "inset" | "margin" | "padding" | "border-width" | "border-style" | "border-color"
type Value = string | number | null | undefined
type Side = "top" | "bottom" | "left" | "right"

type EdgeValues = {
  full: Value
  x: Value
  y: Value
  top: Value
  left: Value
  right: Value
  bottom: Value
}

type Definitions = Record<Property, { unit?: CssUnits; edgeCss: (side: Side) => string }>

const definitions: Definitions = {
  inset: { unit: "rem", edgeCss: (side) => side },
  margin: { unit: "rem", edgeCss: (side) => `margin-${side}` },
  padding: { unit: "rem", edgeCss: (side) => `padding-${side}` },
  "border-width": { unit: "px", edgeCss: (side) => `border-${side}-width` },
  "border-style": { edgeCss: (side) => `border-${side}-style` },
  "border-color": { edgeCss: (side) => `border-${side}-color` },
}

const hasAnyValue = (vals: EdgeValues) =>
  isValidValue(vals.top) ||
  isValidValue(vals.bottom) ||
  isValidValue(vals.left) ||
  isValidValue(vals.right) ||
  isValidValue(vals.x) ||
  isValidValue(vals.y) ||
  isValidValue(vals.full)

const resolveSides = ({ full, x, y, top, left, right, bottom }: EdgeValues) => {
  const sides: Value[] = [full, full, full, full]
  if (isValidValue(x)) {
    sides[1] = x
    sides[3] = x
  }
  if (isValidValue(y)) {
    sides[0] = y
    sides[2] = y
  }
  if (isValidValue(top)) sides[0] = top
  if (isValidValue(right)) sides[1] = right
  if (isValidValue(bottom)) sides[2] = bottom
  if (isValidValue(left)) sides[3] = left
  return sides
}

const formatShorthand = (property: Property, sides: Value[], calc: (v: Value) => Value) => {
  const [t, r, b, l] = sides
  if (sides.every((val, _, arr) => val === arr[0])) return `${property}: ${calc(t)};`
  if (t === b && r === l) return `${property}: ${calc(t)} ${calc(r)};`
  if (t && r === l && b) return `${property}: ${calc(t)} ${calc(r)} ${calc(b)};`
  return `${property}: ${calc(t)} ${calc(r)} ${calc(b)} ${calc(l)};`
}

const formatIndividual = (
  sides: Value[],
  edgeCss: (side: Side) => string,
  calc: (v: Value) => Value,
) => {
  const [t, r, b, l] = sides
  let output = ""
  if (isValidValue(t)) output += `${edgeCss("top")}: ${calc(t)};`
  if (isValidValue(b)) output += `${edgeCss("bottom")}: ${calc(b)};`
  if (isValidValue(l)) output += `${edgeCss("left")}: ${calc(l)};`
  if (isValidValue(r)) output += `${edgeCss("right")}: ${calc(r)};`
  return output
}

export type Edge = (rootSize?: number) => (property: Property, values: EdgeValues) => string | null

const edge: Edge =
  (rootSize = 16) =>
  (property, values) => {
    if (!hasAnyValue(values)) return null
    const { unit, edgeCss } = definitions[property]
    const calc = (param: Value) => (unit ? value(param, rootSize, unit) : param)
    const sides = resolveSides(values)
    if (sides.every((val) => isValidValue(val))) return formatShorthand(property, sides, calc)
    return formatIndividual(sides, edgeCss, calc)
  }

export default edge
