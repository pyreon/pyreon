export type PseudoActions = {
  onMouseEnter: (e: MouseEvent) => void
  onMouseLeave: (e: MouseEvent) => void
  onMouseDown: (e: MouseEvent) => void
  onMouseUp: (e: MouseEvent) => void
  onFocus: (e: FocusEvent) => void
  onBlur: (e: FocusEvent) => void
}

export type PseudoState = {
  active: boolean
  hover: boolean
  focus: boolean
  pressed: boolean
  disabled: boolean
  readOnly: boolean
}

export type PseudoProps = Partial<PseudoState & PseudoActions>
