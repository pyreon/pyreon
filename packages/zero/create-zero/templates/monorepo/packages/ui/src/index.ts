import { h, type VNodeChild } from '@pyreon/core'
import type { ButtonVariant } from '@{{name}}/types'

interface ButtonProps {
  variant?: ButtonVariant
  onClick?: (e: Event) => void
  children?: VNodeChild
}

export const Button = (props: ButtonProps) => {
  const variant = props.variant ?? 'primary'
  return h(
    'button',
    {
      class: `ui-button ui-button--${variant}`,
      onClick: props.onClick,
    },
    props.children,
  )
}
