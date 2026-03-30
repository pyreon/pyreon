import { value } from '../../units'

type PropertyValue = string | number | null | undefined
type PV = PropertyValue

const isValidValue = (v: unknown) => !!v || v === 0

type CornerValues = {
  full: PV
  top: PV
  bottom: PV
  left: PV
  right: PV
  topLeft: PV
  topRight: PV
  bottomLeft: PV
  bottomRight: PV
}

const hasAnyValue = (v: CornerValues) =>
  isValidValue(v.full) ||
  isValidValue(v.top) ||
  isValidValue(v.bottom) ||
  isValidValue(v.left) ||
  isValidValue(v.right) ||
  isValidValue(v.topLeft) ||
  isValidValue(v.topRight) ||
  isValidValue(v.bottomLeft) ||
  isValidValue(v.bottomRight)

const resolveCorners = (v: CornerValues) => {
  const corners: PV[] = [v.full, v.full, v.full, v.full]
  if (isValidValue(v.top)) {
    corners[0] = v.top
    corners[1] = v.top
  }
  if (isValidValue(v.bottom)) {
    corners[2] = v.bottom
    corners[3] = v.bottom
  }
  if (isValidValue(v.left)) {
    corners[0] = v.left
    corners[3] = v.left
  }
  if (isValidValue(v.right)) {
    corners[1] = v.right
    corners[2] = v.right
  }
  if (isValidValue(v.topLeft)) corners[0] = v.topLeft
  if (isValidValue(v.topRight)) corners[1] = v.topRight
  if (isValidValue(v.bottomRight)) corners[2] = v.bottomRight
  if (isValidValue(v.bottomLeft)) corners[3] = v.bottomLeft
  return corners
}

const formatShorthand = (corners: PV[], calc: (p: PV) => any) => {
  const [tl, tr, br, bl] = corners
  if (corners.every((val, _, arr) => val === arr[0])) return `border-radius: ${calc(tl)};`
  if (tl === br && tr === bl) return `border-radius: ${calc(tl)} ${calc(tr)};`
  if (tl && tr === bl && br) return `border-radius: ${calc(tl)} ${calc(tr)} ${calc(br)};`
  return `border-radius: ${calc(tl)} ${calc(tr)} ${calc(br)} ${calc(bl)};`
}

const CORNER_CSS = [
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
] as const

const formatIndividual = (corners: PV[], calc: (p: PV) => any) => {
  let output = ''
  for (let i = 0; i < corners.length; i++) {
    if (isValidValue(corners[i])) output += `${CORNER_CSS[i]}: ${calc(corners[i])};`
  }
  return output
}

export type BorderRadius = (rootSize?: number) => (props: CornerValues) => string | null

const borderRadius: BorderRadius = (rootSize) => (props) => {
  if (!hasAnyValue(props)) return null
  const calc = (param: PV) => value(param, rootSize)
  const corners = resolveCorners(props)
  if (corners.every((val) => isValidValue(val))) return formatShorthand(corners, calc)
  return formatIndividual(corners, calc)
}

export default borderRadius
